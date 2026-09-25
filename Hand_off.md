# Hand-off

## 0 · Start here (written at the close of 2026-09-25, twentieth session)

**Check first.** `git fetch`, `git log --oneline -1 origin/main` (this session's work merged as the
`arms-whip-grip` PR), `git worktree list`. Another agent session shares the main checkout
(`/home/kill/KoLd__FEEt.ice_skating_`, on `phase17-assurance`, uncommitted `games/ice-run-godot/…`,
`tools/ice-lab/test/turns.test.ts`, untracked `docs/phase17-*.md`, `tools/ice-lab/test/phase17-replay.test.ts`)
— **touch none of it**. Work in a worktree off `origin/main`
(`git worktree add -b <branch> ../KoLd__FEEt.<name> origin/main`). Operator data, untracked on purpose:
`E_W_replays_sessions_eng_bld/`, `Ice Lab — KoLd__FEEt edgework.html`, `session-notes/`.

**Suite at close: 697/705, eight known failures — main is red on purpose, merged by the operator's word.**
They are the arms' whip waiting for its re-scripts (§0.1 item 5): backjump (2), the ghost's loop (2), the
tutorial's "Turn in the air" (Simulation, Experimental, and the not-a-fluke test), and the replay fixture
(`initial.params.jumpInertiaTucked: missing field` — it needs the `/40` bump). Anything else failing is new.
Typecheck clean (scratch TypeScript 7 — memory `ice-lab-typecheck-toolchain`). Replay contract still
**`ice-lab-f64/39`**: every physics change below is behind a mode that is **off everywhere**, so no digest moved.

**The operator plays at `http://localhost:8130/game/`**, served from `/home/kill/KoLd__FEEt.play` (detached at
`origin/main`) by this session's background task, which dies with it. Bring it back:
`cd /home/kill/KoLd__FEEt.play && git fetch && git checkout --detach origin/main && cd tools/ice-lab &&
PORT=8130 npm run serve` (in the background). None of today's modes are on in the game, so play is
yesterday's physics plus the two Experimental control fixes (§0.2).

### 0.1 · The queue, in the operator's order (the plan agreed 2026-09-25)

The goal is a double loop that emerges from the physics and lands, matched against a measured one — not
720° of air, not a stronger blade. What is proven so far is in §0.3.

1. **Air posture — first pass built (2026-09-25, later the same day; branch `air-posture`).**
   `airPostureMode` 1: torque-free flight (the roll and pitch keep the rates blade-off launched — the takeoff
   used to zero the lean's rate and the air froze both; yaw stays L / I), blade-off ends the ground's
   balance state, touchdown scores no balance term (the stale takeoff error was what zeroed every landing)
   and the ice decides. The operator's spec: a physics-truth mode — no righting, no damping, no snap, no new
   constant; let it fall. `node test/air-posture.ts` answers "doomed at blade-off, or on the ice?":
   **the toe+hook takeoffs are doomed at blade-off** — roll 2.00 / 1.27 rad/s and pitch ~0.3 rad/s toward
   the toe put them down 158-350 ms after touchdown whatever the landing asks; the calibration takeoff's
   roll (0.59) rights it -0.67 → -0.38 and helps. Every best-check landing is still a 2Lo `<<`, so landing
   recovery cannot be judged until the rotation is there (items 2-3). **Next fork (operator):** the
   takeoff's launched roll and pitch (the committed edge throws the body up and over — a takeoff-mechanics
   question), and what to do with `landingShock` (authored; under the mode it is the whole touchdown roll
   change, +1.0 rad/s, where the spec wants the contact's impulse). Deferred by the operator's word:
   in-air reorientation (only ever as segment motion), 3D tilt/precession (needs a transverse inertia).
2. **Flight time.** 0.492 s against the measured 0.443 ± 0.025: the takeoff leaves at 2.44 m/s up, 0.443 s
   needs 2.17 (`test/loop-calibration.ts`). It survives cohort scaling, so the vertical impulse
   (`jumpImpulse` 2.94, the bible's, × quality, less `jumpSpeedShare`) is the axis — correct the push
   mechanics, not the timing.
3. **Re-run the double loop** (`node test/loop-calibration.ts --set edgeCommitMode=1`, and
   `node test/takeoff-budget.ts commit --set pushOffMode=1 --set normalLoadMode=1 --set rotationCallMode=1`,
   `node test/air-posture.ts`) with 1 and 2 in. Leave the tuck alone until then (§0.5).
4. **Canonicalise once, then `/40` once** (operator: "avoid repeated golden churn"): turn on
   `normalLoadMode`, `pushOffMode`, `rotationCallMode`, `edgeCommitMode`, `airPostureMode` — in the
   setups or as defaults, the operator's call — run the whole suite, inspect every moved test, fix or re-pin
   with a measured note, then the contract bump: `/39 → /40` history note in `sim/replay.ts`,
   `node replay/rebase-fixture.ts`, pins in `docs/controller-scheme.md`, `validate.mjs --report`,
   `node test/setup-script.ts --write` (say why in the commit), Godot `prepare.mjs --engine-only`, the native
   reference, `docs/open-constants.md` entries (none of today's constants are there yet).
   Measured blast radius of `normalLoadMode` alone as the default: **35 tests move** (§0.6 has the triage).
5. **Re-script onto the new takeoff**: backjump, the ghost's loop (`game/ghost.ts`), the tutorial's air step
   — the eight known failures.
6. **The Experimental arms, last** (operator: "arms should complement the transition, not be the rotational
   actuator"). The B→X ease takes ~0.67 s against a ~0.5 s load, so the arms' request crosses zero mid-load
   and thrashes; the pad's loop scripts still pivot the feet and gain nothing from any of today's modes.
7. Older items still open (from the nineteenth's §0.3, archived): which paddle is which (b18-21 order,
   the operator presses them on the probe card); **[operator]** play the tutorial and Dig Gate and export
   replays into `E_W_replays_sessions_eng_bld/`; tutorial loose ends; Dig Gate forward digs fall; the ghost's
   lutz; combining the five setups into three (when asked); the other session's
   `phase17-replay.test.ts` pins `/35` (a one-line change, with the operator's leave).

### 0.2 · What exists now (all under `tools/ice-lab/`)

| What | Where | State |
| --- | --- | --- |
| The arms' whip through the edge, grip-limited (`armsWhipMode`, `armsWhipTorque` 60) — the shoulders' reaction now reaches the ice **through the trunk** in both branches of the trunk solve | `sim/solver.ts` `trunkTorque`, `armsWhipTorque` | on in the trunk setups (WIP from the nineteenth) |
| Air-only tuck `jumpInertiaTucked` (0.5 in the trunk setups, 0.95 default) | `sim/jump.ts`, `game/setups.ts` | on in the trunk setups — see §0.5, it is tighter than measured |
| **Push-off** (`pushOffMode`, `pushOffTime` 0.12 s): the blade stays on the ice after the release and carries the legs' upward speed, m v / T (~3 body weights) | `sim/jump.ts` (release → `J.pushFrom`), `sim/solver.ts` (normal load) | off |
| **Groove pivot** (`pivotGrooveMode`): a pivoting blade's grip falls to the scrape's share across the angle it takes to leave its own groove (rutWidth / half chord) | `sim/solver.ts` `pivotGrip` | off |
| **Normal force ≠ weight** (`normalLoadMode`): a blade carries its share of the body's *mass* round a curve; its load sets the grip, not the demand. The lean still tips under g (the leg pushes along itself) | `sim/solver.ts` `bladeMass` | off — the edge-flattening fix, §0.3 |
| **Rotation call at first touchdown** (`rotationCallMode`, `callTakeoffCredit` 0.5 rev): takeoff turn (edge-carried vs pivot/skid), airborne, landing residual (0.3 s, never credited) kept apart in `JumpResult`; edge credited up to ½, pivot never, pivot > ⅛ = cheated takeoff | `sim/jump.ts` `land()`, `sim/types.ts` `JumpResult` | off |
| **Edge commitment** (`edgeCommitMode`, `edgeCommitTime` 0.2 s): once a jump's load begins the balance loop's lean-error and lean-rate terms fade out together; the lean's feed-forward stays; the body answers the committed curve uncorrected | `sim/solver.ts` section 2 | off |
| **Air posture** (`airPostureMode`): torque-free flight — lean and pitch turn at blade-off's rates, yaw L / I; blade-off clears the ground's balance state (takeoff error kept as `JumpState.takeoffBalanceError`, diagnostics only); touchdown has no balance score, the ice decides | `sim/jump.ts` takeoff, `jumpAir`, `land()` | off |
| `diagTakeoffBalance` 1-5 — **test-only diagnostic, never in a setup** (counter-steer out / edge held / out in the push only / Kp only / Kd only) | `sim/solver.ts`, `sim/params.ts` | 0 |
| Experimental controls: no automatic crossover while a jump loads; the automatic crossovers skate in a bent stance (`CROSS_STANCE` 0.35 eased at 1/s) so a beat no longer sinks the knee 0.35 in 0.1 s | `game/full-controls.ts` | on (Experimental, Dig Gate) |
| Observability: `SkaterState.torqueBudget`, `balanceBudget` — attached only by tools, never by `createState`, so no digest sees them; `sim/jump.ts` `bodyRate` (the takeoff's own spin read, factored out unchanged) | `sim/types.ts` | — |
| Tools: `test/air-posture.ts` (blade-off → +1 s timeline, roll/pitch-out counterfactuals, landing-input sweep; `attempt()` now takes `rideOut`, `landLean`, `landKnee`, `atTakeoff`), `test/takeoff-budget.ts` (`trace`, `sweep`, `balance`, `transition`, `hook`, `free-leg`, `takeoff`, `ab`, `commit`; attempts `pad`/`direct`/`held`; `--set key=value`), `test/loop-comparison.ts` (the nine-scenario comparison set every candidate must pass), `test/loop-calibration.ts` (production vs a cohort-sized skater vs the published 2Lo) | `test/` | — |

### 0.3 · What was measured (the evidence behind the decisions)

- **The blade's pivot grip** is ~8-9 N m on a shallow approach edge, ~20 N m on a 0.5 rad edge at body
  weight, 60-90 only on a deep one: a ~10 cm contact holding ~800 N sideways. The shoulders at 60 N m (and
  the free leg's hip at 100) pivot the feet outright. Probably physically right; the arms cannot be the
  main spin source.
- **The edge flattening (-0.9 → -0.5)** was the carve reading load as mass (`normalLoad / g`): a knee's
  sink (0.35-0.6 BW) took force off the curve and the lean fell in (the -1.13 "deep edge" was the balance
  loop's catch), a push-off (3 BW) tripled it and threw the lean upright. `normalLoadMode` fixes it: on a
  held edge the tilt now deepens through the load and holds (-0.80 at takeoff), takeoff L 2.3 → 7.2.
- **Transition, by segment** (held edge, arms still): nearly all the L is the carve's inclination (+1.9 in
  the load). **The hook creates no L** (+0.4..+0.6 at every strength; it redirects ~0.5 rad).
  **The free leg is the largest single contributor**: swung *back* late in the load/push, +7..+8 (takeoff
  L 14.6, 1.17 rev tucked); early, the skater falls; forward, it kills L.
- **Cohort calibration** (46.9 kg / 1.55 m, the production body scaled geometrically — both give identical
  normalised numbers): L 89 ×10⁻³ vs 140.2 (−4.5 sd), flight 0.492 vs 0.443, air 424° vs 470.5°,
  862 vs 1064°/s. The 0.5 air tuck's effective mean inertia is 0.67 kg m² vs a measured ~0.85 (0.95 gives
  0.96).
- **The balance loop, not the rocker, stops the takeoff curl.** With its feedback out for the load and the
  contact on the toe section (asked from the load's start — the pendulum moves it heelward first), the
  toe's shorter rocker tightens the arc 2.8 → 1.48 m, yaw 3.8 rad/s, L 21.4 (130 ×10⁻³), 2Lo clean at
  touchdown. Out only in the push: nothing. Kp out alone: nothing. Kd out alone: falls.
  Aiming the lean at upright instead (tried, reverted): L 14.6 → 7.9.
- **Edge commitment**, smooth in its fade (no cliff): toe + hook, 0.05 s → L 20.9 (clean), 0.2 s → 19.4
  (118 ×10⁻³, q), off → 16.6 (<); without toe or hook 15.4. Glides unchanged; the bad takeoffs still fail.
- **Published double loop** (Frontiers in Sports and Active Living 2025, PMC12426178; women 46.9 kg,
  1.55 m): flight 0.443 ± 0.025 s, **470.5 ± 23.9° in the air**, 1063.9 ± 54.7°/s, L 140.2 ± 11.2 ×10⁻³
  m h² s⁻¹ (≈15.8 kg m²/s — not 16.5, the 2 kg skates are separate). Knoll & Hildebrand ISBS 1998 (elite
  men): 3A L 32.8 at last contact, 2A 29.6, flight 0.68-0.76 s. **No accessible source for tuck timing** —
  the open papers say only "as soon as possible"; do not invent one.

### 0.4 · Key decisions today (the operator's unless marked)

- The whip: air-only tuck (not a lower `inertiaTucked`); crossover pause while loading **kept**; "a swing
  during the load asks the full whip at once" **built, measured worse (L 15 → 8), removed**.
- Chase the double as **contact-physics calibration**, not bigger numbers; instrumentation, physics and
  controls in separate commits; **don't bump the contract** until the physics is proven — then once.
- Don't touch the 20 N m grip, the arms or the tuck; investigate **transition-first** (inclination, free
  leg, the hook as redirection).
- The plan A-E: A the crossover knee dip (done), B `normalLoadMode` canonical (measured; held back while D
  may move it), C the phase rotation model (done), D calibrate against the measured 2Lo (in progress),
  E re-run before any tuck change (done: 2Lo<<, then q with commitment).
- **Rotation call**: classify at first touchdown; rotation after touchdown never counts; the takeoff
  **edge's** turn credited up to ½ a revolution, the pivot never (strict ¼ would downgrade the published
  470° double). ISU: exactly ¼ short q, >¼ <½ `<`, ≥½ `<<`.
- Treat **470° airborne as the calibration target**, a ~200° takeoff-edge turn only as a hypothesis.
- Cohort normalisation before physics changes; the production skater is not modified.
- Build **edge commitment** behind a mode (done). Next: the **air posture**.
- (agent) Physics fixes that turned out wrong were reverted and recorded, not kept as dead modes: lean
  tipping under N/m (the leg pushes through the centre of mass), the aim-upright takeoff balance.

### 0.5 · Unresolved assumptions (authored or unmeasured — none are in `docs/open-constants.md` yet)

- `pushOffTime` 0.12 s (a takeoff's push, ~0.1-0.15 s by the literature's description, not a sourced number).
- `callTakeoffCredit` 0.5 rev — the operator's policy; `LANDING_SETTLE` 0.3 s (the residual's window).
- `edgeCommitTime` 0.2 s (any 0.05-0.3 behaves; measured as a range).
- `CROSS_STANCE` 0.35 and its 1/s ease (Experimental controls).
- `jumpInertiaTucked` 0.5 — measured tighter than the effective in-air mean; 0.95 is looser. Hold until
  flight time and the air posture are fixed.
- `armsWhipTorque` 60 (= `twistTorqueMax`); the free leg's 100 N m hip — both far past the edge's grip.
- The production skater's stature: 1.73 m inferred from `comHeight` 0.95 at 0.55 of height (the model has
  none); the cohort body scales torques by m·h and inertias by m·h² — an assumption of similarity.
- The free leg's reaction is "braced" (both bodies) in the pivot branch but on the lower body in the held
  branch — the same inconsistency the arms had; left as found (it was a measured fix for another problem).
- The pendulum is non-minimum-phase: a lean onto the toe must begin early (moves heelward first).
- A stroke on the only loaded foot zeroes the curve's lateral support for 0.25 s (pre-existing; it is what
  kills the 170° scheme-B reversal under `normalLoadMode`).
- No roll or pitch inertia in the model (point-mass pendulum; the tuck moves only the yaw inertia), so
  under `airPostureMode` conserved roll/pitch momentum is a conserved rate. A real tuck changes the frontal
  inertia somewhat; unmodelled. No accessible measured take-off tilt (Frontiers 2025 is vertical-axis only;
  MDPI Proc. 49:124 returned 403).
- `landingShock` 1.5 (authored) is, under `airPostureMode`, the whole touchdown roll change; its direction
  is now off upright (the landing blade carries no lateral force yet).
- At a crawl the carve has no authority to right a lean (known limit; it is what the hockey-stop bot's
  glide hits under `normalLoadMode`).

### 0.6 · How this session worked, and what tripped it

- **Triage of `normalLoadMode` as the default** (35 tests): ~20 are jump/rotation-call tests that the new
  takeoff and call will rewrite anyway — re-pin those after D, not before. The rest: pinned numbers that
  shifted (dig/whip L, the pendulum fingerprint, the three mapping goldens, stroke speeds, crossovers 21 vs
  20, the toe pick at 0.5 m/s); and marginal bot paths, traced: the hockey stop itself is identical in both
  modes, the bot's low-speed glide leaves a lean it cannot right; the 170° reversal diverges from tick 36
  (the initial knee settle scaled lateral force by 1.19) and dies on the stroke-on-the-loaded-foot issue.
  Still untraced: "landing on a straight leg is a fall", the 3T+2Lo combinations, the block's loop 2.88 → 0.
- **The shell is fish**: `$var` does not word-split — `for x in "a b"; node … $x` passes one argument.
  Call each variant explicitly.
- **Float association is a replay change**: regrouping `a + b + c + d` or reordering a product moved the
  mapping golden and a strict-equality test. Keep the mode-off path's expression byte-identical; compute a
  mode's variant separately.
- **Transcendentals must go through `sim/math.ts`** (`atan2`, `sin`, `cos`, `wrapPi`) — a test enforces it.
- **The setup-mapping golden** (`test/fixtures/setup-mapping-v1.json`) is input mapping, not the replay
  contract: re-record with `node test/setup-script.ts --write` after an intended control change.
- **Optional state fields keep digests still**: a mode's state lives in `?` fields set only when the mode is
  on and set back to `undefined` (JSON drops them). Tool-only observability is attached by the tool.
- Probe scripts live in the session scratchpad and die with it; the committed tools
  (`takeoff-budget.ts`, `loop-comparison.ts`, `loop-calibration.ts`) are the record.
- Paywalled biomechanics (Taylor & Francis, ResearchGate, NMU commons) return 403 to fetches; PMC and the
  Konstanz ISBS archive are open.

## Follow-up · three gameplay setups (local changes)

The operator requested three distinct controller setups: minimal-assist simulation,
assisted blade/ice exploration, and access to the move repertoire. Implemented in
`game/setups.ts`, shared by browser, controller workshop and Godot bridge:

- Simulation: one stick per blade; hold the profile modifier (default L3) for
  right-stick arms while retaining the right blade command. Responsive athlete
  balance model, no added jump/landing/hype assistance, manual strokes and turns.
- Blade Explorer: direct lean/pressure, manual turns and landing control; adjustable
  50–100% balance and speed-aware lean assistance, default 75%.
- Full Repertoire: dedicated turn/glide commands, assisted balance and wind-up,
  optional game landing coach. No new unimplemented moves are claimed.

The stick layout choices are provisional defaults: clarification was offered but
no reply arrived during implementation. All three start with Cruise off. Legacy
mapping overrides remain, and the lab's A/B/C experiment is unchanged. Setup
changes start a fresh browser run / apply to the next Godot skate. The workshop
can compare all three, save browser setup/sensitivity, and export replay inputs.
Profile JSON transfers bindings/sensitivity only; Godot setup/assistance is separate.

Verified: 500 browser/simulation + 20 bridge tests, TypeScript check, build,
browser menu/persistence/virtual-pad checks without page errors, and both Godot
smoke checks. Replay stays `/22`: setups change mapped inputs/parameters,
not solver arithmetic. See `docs/controller-scheme.md` for controls and limitations.
Next: physical Xbox-pad comparison of shallow edges, low-speed lean, right-blade
retention while controlling arms, manual turn gestures and Repertoire landings.
Sensitivity and assistance remain authored starting points pending that play data.

## Follow-up · 2026-09-21 rocker lateral-load fix (local changes)

Confirmed and fixed the rocker/counter inconsistency listed below: at the cusp,
the lean flipped but the path kept bending the entry way. Both turns now negate
`pathRate`, so the exit trajectory and lateral load follow the exit lean. Eight
regression cases cover both feet, both curve directions, and both turn kinds;
all eight failed before the fix and pass after it. This checks model consistency,
not validation against real skating. Replay contract is now `ice-lab-f64/22`;
the 240-frame fixture's inputs and digests are unchanged. Older rocker/counter
clips need their original solver or re-recording.

Verified: 491 browser/sim tests, 16 Godot bridge tests, both Godot smoke checks,
TypeScript check, browser build, and fidelity report (6 internal cases pass;
external gate remains unmet).
Queue item 7(a) and the rocker lateral-load assumption below are resolved.

## 0 (previous) · Start here (written at the close of 2026-09-21, sixteenth session)

**Check first.** Another agent session may share this checkout. Run `git status --short --branch` and
`git log --oneline origin/main -1`. At close: `main` = `11b1a87` (PR #18 merged), and
`ue-replay-01-foundation` has nothing `main` lacks. Untracked on purpose at the root, touch none without
asking: `E_W_replays_sessions_eng_bld/` (operator play data), `Ice Lab — KoLd__FEEt edgework.html`,
`session-notes/`. Older checkpoints and the previous §0 are in [`Hand_off-archive.md`](Hand_off-archive.md).

### What exists now (all on `main`)

| Area | State | Where |
| --- | --- | --- |
| Full repertoire controls | Game scheme 3 / replay label D, browser + Godot; workshop at `/game/controller.html` | `game/full-controls.ts`, `docs/controller-scheme.md` |
| Turns | three-turn, mohawk, bracket, loop, rocker, counter, **choctaw** (new) | `sim/moves.ts` `turnPivot`, `TURN_KIND` comment |
| Step ladder | 10 observable types; grade 4 checks both rotational directions (new); needs an 11th type | `sim/stepLevel.ts` |
| Jump combinations | recognised from physics + data (new); T and Lo follow; up to 3 jumps | `sim/combo.ts` |
| Protocol sheet | elements, repetition rule `*`, fall deductions, TES + PCS − ded = total (new) | `sim/sheet.ts`, `Choreography.segmentScore` |
| Godot costumes | browser `SKINS` recolour Violet at runtime (new) | `scripts/skater.gd`, `tools/build_skater.py` |
| Replay contract | **`ice-lab-f64/21`** | `sim/replay.ts` history comment |

Verified at close: 482 browser/sim + 16 Godot bridge tests, typecheck clean, both Godot smoke tests,
CI green on every PR (#16, #17, #18).

### The queue, next (operator's order; items needing the operator are marked)

1. **[operator] Play Full repertoire on the Xbox pad** (old item 9) — `http://localhost:8123/game/controller.html`
   and the game with scheme Full repertoire. Now covers five untested-by-hand things: `rockerCounterStick`
   on an analog stick, the choctaw gesture (L3 + D-pad right / G), a jump combination (turn Cruise off,
   land backward, stay on the edge, reload with a toe tap), the protocol sheet on a career result, and
   default lean sensitivity 0.7. Export the replay and drop it in `E_W_replays_sessions_eng_bld/`.
2. **[operator decision] Eleventh step type for grade 4.** Every ISU "steps" type (chassé, toe step,
   cross roll, running step, cross behind/in front) would be authored from nothing — the toe pick does
   nothing outside a jump. `sim/stepLevel.ts`'s header forbids inventing a type to pad the count, so do
   not build one without a yes.
3. **[operator decision] Native C++ track**: pinned to `/5` while the game is at `/21`. Re-pin to a
   current solver, or keep transcribing `/5`? Do not start transcription before this is answered.
4. **[operator decision] Career content** (old item 11): which of step, spiral, loop/rocker/counter,
   choctaw, combo belong in the fixed `CAREER_EVENTS` routines. The Composer can already use all of them.
5. **[operator decision] Medals from the segment total?** Medals are still fall-based; `segmentScore`
   now exists. A content/economy call.
6. **[operator] Watch a beginner** before judging `BEGINNER_PARAMS`' blanket inheritance (old item 12).
7. **Solo, if the operator says "keep going" with none of the above answered** — in this order:
   (a) check the rocker's lateral-load consistency (see "Unresolved" below); (b) jump sequences only if
   the operator supplies a bound for "linked"; (c) Godot: show the protocol sheet as a list, not one line.

### Unresolved assumptions (authored, not measured — revisit with play data)

- `choctawScrub` 1.65 is calibrated to the data's −0.55 m/s, but the **gesture** (mohawk weight shift +
  rocker reversal) and its binding are design choices awaiting hands-on feedback. The choctaw rotates into
  the entry curve (`T.dir` unchanged); real choctaws can be skated either way.
- **Rocker lateral load, noticed not verified**: the choctaw keeps the lean frame *and* negates
  `T.pathRate` so `lat` stays on the lean's side. The rocker flips the lean (`flipFrame`) but keeps
  `pathRate` and `travelSense`, so its second-half `lat` may oppose the lean. Tests show rockers land;
  check before assuming it is right.
- Combinations: no time limit (data has none); the edge may read `RB-`/`RBI` briefly between jumps and
  the link still holds (jump identity is foot/direction/toe). A judge might call a long glide a break.
- Combination scoring sums per-jump GOEs; the ISU gives one GOE per element. No data for that rule.
- Repetition rule per the bible (`*`, triples/quads only), not ISU `+REP`.
- Godot's default Violet now wears the browser Violet colours, not the old authored midnight plum.
- A local server (`node app/serve.mjs`, port 8123) was started in the background this session.

### Toolchain, current

- **Typecheck**: no `tsc` on the box. Scratch-install `typescript` + `@types/node` in the session
  scratchpad, then from `tools/ice-lab/`: `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.
  `erasableSyntaxOnly` is on: no constructor parameter properties, no enums.
- **Replay contract bump**: bump `REPLAY_SOLVER`, add a history entry, then
  `node tools/ice-lab/replay/rebase-fixture.ts [rev]` — re-records the fixture from `rev`'s inputs and
  refuses to write if frames, schemes or inputs moved. Then
  `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md`.
- **Godot**: after any `sim/`/`game/` change, `node games/ice-run-godot/tools/prepare.mjs`, then
  `node --test games/ice-run-godot/tests/` and
  `godot4 --headless --path games/ice-run-godot -- --smoke-test [--full-controls]`.
  Screenshots: `godot4 --path games/ice-run-godot -- --capture [--costume=N]` (needs the display;
  writes `/tmp/edgework-godot-*.png`). Rebuilding the skater: `blender --background --python
  games/ice-run-godot/tools/build_skater.py` (Blender 5.2.2; the MeshOptimizer error it prints is harmless).
- **Browser check**: `node tools/ice-lab/app/build.mjs`, serve with `node tools/ice-lab/app/serve.mjs`,
  drive with Playwright from `/home/kill/astro-aae/frontend/node_modules/playwright` (borrowed, not a
  dependency). The start overlay blocks header buttons; set `#scheme-select`/`#difficulty` by
  dispatching `change` events. Scripted real-time *skating* (landing jumps) is unreliable — Cruise's
  auto-pushes steer into the boards; prove mechanics in `sim` tests and the Godot bridge instead.
- **Merging**: the auto-mode classifier blocks `gh pr merge` ("merge without review"). Open the PR, wait
  for CI, and ask the operator to run `! gh pr merge N --merge` (or add a permission rule).

### Working with this operator

- "keep going" means: continue with the next item that is grounded in data or the design bible, never
  one that invents rules or mechanics; say in one line what was picked and why. Stop and ask when every
  remaining item is a decision (see the queue).
- One step, no side notes while they are executing; the review goes at the end.
- Physics-caused behaviour is welcome (the combination was already possible — only recognising it was
  new). Show play as replays where possible.
- The operator closes with: review, key decisions, unresolved assumptions, three efficiency examples
  each side, prompting advice, one or two vocabulary words, then this file. See §8.

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

All five ISU difficult turns and all three simple ones (three-turn, mohawk, choctaw) are real as of
2026-09-21. The six ISU "step" types (chassé, toe step, cross roll, running step, cross behind/in front)
remain unbuilt with no data behind any of them (`data/motion-primitives.json` has none) — only
change-of-edge and the rig-specific crossover count from that category, so grade 4's eleven types wait on
an operator decision. Jump combinations are recognised (`sim/combo.ts`); jump sequences are not.
Animation, networking. The stroke is the bible's semi-analytic push, not a leg model. A rhythm layer and
rink-boundary collision exist in `game/`, both outside what a replay verifies.

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
| 2026-09-24 (nineteenth) | With subagents in parallel: the toe-pick trip (built, then off by the operator), the dig under the pendulum (lean early; telemetry, oracle, fingerprint), arms in the fore-aft pendulum, strokes that switch feet and land on both feet at a crawl, standing-leg pushes, standstill snaps, forgiving/strong thumb strokes, Dig Gate (fifth setup), the AI ghost (skates into its tricks), the tutorial, Elite paddles (b18–b21), lab scheme C arms and hop hints, compact HUD. PRs #30–#43, contract /37 → /39, 703 tests. In flight: the grip-limited arms whip + tucked inertia 0.5 (§0.1). |
| 2026-09-23 (eighteenth) | The fore-aft pendulum (`pitchMode`, PR #27): along the support blade, capture-point ankle over half a blade, only along-blade ice forces pitch the body, `FALL.Pitched`; contract `/36`. Switched on in Simulation and Experimental (PR #28), skill tests re-measured, hockey-stop test pinned on the scrape. Four design turns, each a force applied at the wrong point — see §0.2. |
| 2026-09-23 (seventeenth) | Every move through the blades: stages A (two-blade), B1 (slip, scrape, dig), B2 (feet), C1/C2 (trunk), the free leg; setups assigned; the Experimental setup (pumps, thumb strokes, X/B, toe clicks, A/Y families, automatic back crossovers); the hockey stop and a backward double loop from play; speed-to-spin built and left off; merged origin/main (Phase 17/18) and fixed the two bugs its mapping script found. Replay `/22` → `/35`. 609 + 20 tests. |
| 2026-09-21 (sixteenth, part three) | Jump combinations (`sim/combo.ts`, PR #17) and the protocol sheet (`sim/sheet.ts`, PR #18): the solver already allowed a jump straight off a landing edge; the data's `landing_edge` + takeoff defines the link. Sheet applies the bible's repetition rule and the data's fall deductions; segment total on both result screens. Hand-off restructured: stale checkpoints and §0 moved to `Hand_off-archive.md`. |
| 2026-09-21 (sixteenth, part two) | Choctaw (mohawk with `flipFrame` skipped, `choctawScrub` 1.65, replay `/21`), `replay/rebase-fixture.ts`, Godot costume parity (split skirt/tights materials, runtime recolour from `SKINS`). PR #16. |
| 2026-09-21 (sixteenth, part one) | Committed the Full repertoire controls (item 8), then grade 4's both-rotational-directions gate (item 10) via `s.turn.dir` at turn completion, no solver change. |
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

---

The sixteenth session's shape (2026-09-21): **when the queue is all operator decisions, pick the next
item the data already defines — and name the ones that would need invention instead of building them.**
Operator asks, in order: "keep building", "commit and start item 10", "push it and keep going", "merge
it to main and keep going", "keep going" (twice), then this close-out. Four PRs merged (#16, #17, #18
plus the controls commit riding in #16).

**Key decisions**

1. Commit the finished controller work before starting item 10, so each change is its own commit.
2. Grade 4's rotational gate reads `s.turn.dir` on the completion tick — no new solver state, no replay bump.
3. The choctaw is the mohawk with `flipFrame` skipped and `T.pathRate` reversed; gesture = mohawk weight
   shift + rocker reversal; `choctawScrub` calibrated to the data (−0.55 m/s at 6 m/s); replay `/21`.
4. Saved v1 controller profiles gain new bindings (`LATER_ACTIONS`) rather than being discarded.
5. The replay-bump recipe became `replay/rebase-fixture.ts` after five sessions of retyping it.
6. Godot costumes: split skirt/tights materials in the build script, recolour by material name at runtime.
7. Declined to invent a toe step for grade 4 and declined to re-pin the native track — both handed back.
8. Combinations are recognised from data (`landing_edge` = next takeoff, link unbroken), with no time
   limit and no scoring change; the protocol sheet adds the bible's repetition rule, the data's fall
   deductions and a segment total, leaving medals fall-based.

**Where Claude could have been more efficient**

1. Test edits by global `sed` and unchecked names cost reruns: `JUMP.T` instead of `JUMP.Toeloop`, and a
   `sed` meant for one new line also rewrote an existing counter test. Unique-context `Edit`s and a
   one-line enum check before writing tests would have avoided both.
2. Three Playwright runs tried to land a combination by scripted keyboard skating, which Cruise's
   auto-pushes defeat. After the first failure, the sim/bridge evidence should have been declared
   sufficient and the live check limited to "loads, runs, no errors".
3. The hand-off's §0 was left stale all session while new checkpoint bullets piled up above it, so the
   close-out had to restructure the file. Keeping §0 current as each PR merged would have been cheaper.

**Where the operator could have been more efficient**

1. "keep going" arrived three times while the remaining queue was decisions only (toe step, native
   re-pin, career content). A one-line answer to any of them would have pointed the session at your
   priority instead of the one Claude inferred.
2. Every merge needed a `!` round trip because the classifier blocks `gh pr merge`. A permission rule
   for it (or "I'll merge, just open the PR") removes that step each time.
3. Queue item 9 — ten minutes on the pad with a replay export — now gates five mechanics' tuning.
   It is the single highest-value thing only you can do.

**Prompting, to use these abilities better**

- Give "keep going" a stop condition or a budget: "keep going until the queue needs me, then stop and
  list the decisions" or "one more feature, then close out".
- Answer pending decisions in a batch, even tersely: "toe step: no; native: re-pin; medals: keep".
- Say how much design authoring is allowed: "authored placeholders are fine if flagged" versus
  "data-backed only". That one line decides what "keep going" can build.

**Vocabulary**

- **invariant** — a property that must stay true while everything around it changes. `rebase-fixture.ts`
  checks the replay fixture's invariants (frame count, schemes, inputs) and lets the digests change;
  "what are the invariants here?" is the fastest way to say what a refactor must not break.
- **affordance** — what a system lets its user discover they can do, without being told. The design
  bible's point about combinations is an affordance: only toe loops and loops follow a landing, and the
  player finds that out from the physics, not a rules screen. "Is this an affordance or a rule?" is a
  good test for whether a mechanic belongs in physics or in scoring.
