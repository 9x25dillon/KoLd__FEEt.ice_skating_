# Open constants

**Every number in Ice Lab's model that was chosen rather than measured.**

This is the register [fidelity-gate.md](fidelity-gate.md) refers to. A constant listed here can be
moved to fix a failing case, but only under the rules in
[§7.2](fidelity-gate.md#72--permitted-moves). A constant not listed here cannot be moved that way at
all. Every entry has six fields:

- **Value.** `spec`, and `responsive` where they differ. `responsive` is the preset under test
  ([gate §3](fidelity-gate.md#3--the-configuration-under-test)). `assisted` is not under test and is
  not listed.
- **Used.** File and function in `tools/ice-lab/sim/`.
- **Level.** L0–L3, as defined in [gate §2.1](fidelity-gate.md#21--confidence-levels). An
  unsourced number is **L2** by default. **L3** is used only where the code itself calls the form a
  caricature or a balance lever.
- **Range.** The plausible range it may move within. **"None recorded"** means the constant may not
  move under the gate until a range is written here, with its basis, in a commit of its own.
- **Fixed by.** The observable from [gate §4.3](fidelity-gate.md#43--the-observable-classes), and the
  measurement that would turn the number into evidence.
- **Source.** Where the current value came from, where that is known. A value taken from the design
  bible, `src/reference/`, the engineering package or `data/` is **not** a measurement
  ([gate §2.3](fidelity-gate.md#23--what-is-not-evidence)). Recording where it came from is not
  provenance.

> **Nothing here has been validated.** Every level below is L2 or L3, except the handful in
> [§11](#11--not-open-physical-or-rule-derived) that come from physics or the rules. A level goes up
> only with the case ids that justify it, in a commit that changes nothing else.

Scope: the model in `tools/ice-lab/sim/`. The rig in `app/` (camera, drawing, audio, gamepad schemes)
is left out, because cases drive the solver with `SkatingInput` directly and never go through it.
Career, scoring and session constants are listed by name in [§12](#12--outside-the-gate) so their
absence is deliberate, not an oversight.

---

## 1 · Blade and ice

These are structures S2, S4 and S5 in [gate §4.2](fidelity-gate.md#42--how-the-solver-relates-these-read-from-the-code).

- **`rocker`** — the longitudinal rocker radius
  - Value: `2.05` m
  - Used: `blade.ts` `effectiveRocker`; `moves.ts` `beginPivot`
  - Level: L2
  - Range: 1.8–2.4 m, the design bible's span. That is a specification, not evidence, and is recorded
    only so the constant is not frozen.
  - Fixed by: a rocker gauge or profile template against real figure blades, at several points
    along the blade. Indirectly, `trace_radius_m` against `carve_lean_deg` at known speed.
  - Source: the bible and `SkateSolver.cpp` (the engineering package said 2.2 or 2.4)

- **`rockerToeFraction`** — the effective rocker at the toe, as a share of `rocker`
  - Value: `0.55`
  - Used: `blade.ts` `effectiveRocker`
  - Level: L2
  - Range: (0, 1] by definition. No physical range recorded.
  - Fixed by: blade profile measurement near the toe; turn cusp geometry (`turn_entry_angle_deg`,
    `turn_exit_angle_deg`)
  - Source: `SkateSolver.cpp`

- **`rockerToeOnset`** — where along the blade, 0 heel to 1 toe, the tighter front rocker begins
  - Value: `0.55`
  - Used: `blade.ts` `effectiveRocker`
  - Level: L2
  - Range: (0, 1) by definition. No physical range recorded.
  - Fixed by: blade profile measurement

- **`sharpness`**, **`iceHardness`** — multipliers on bite capacity
  - Value: `1.0`, `1.0`. These are the reference: they define the unit rather than measuring it.
  - Used: `blade.ts` `biteCapacity`. `sharpness` is also baked from blade wear by `profile.ts`
    `applyProfile`.
  - Level: L2
  - Range: none recorded
  - Fixed by: `carve_held` cases on known fresh versus worn blades, and on hard versus soft ice. A
    reference value of 1.0 is only meaningful once a case pins what 1.0 is.

- **`muGlide`** — longitudinal blade friction on a flat blade
  - Value: `0.006`
  - Used: `blade.ts` `muLong`; `moves.ts` `pivotStep`; `solver.ts` `step` §5
  - Level: L2
  - Range: **0.0046–0.0071**. That is measured kinetic friction on long-track speed and hockey blades, at
    1.8–8 m/s on −1.8 to −11 °C ice, as quoted by Lever et al. 2022 from de Koning 1992 and Federolf
    2008 ([ice-literature §2](ice-literature.md#2--kinetic-friction-of-skates-on-rink-ice-the-numbers)).
    **L1** for a figure skate. Both are secondary quotes until the primaries are checked.
  - Fixed by: `glide_decel_ms2` at low speed (below about 3 m/s, where drag is the smaller term), on
    ice with a recorded temperature and time since resurfacing. It is a whole-glide average. Friction
    peaks at touch-down and push-off, and its dependence on ice temperature is contested
    ([ice-literature §3](ice-literature.md#3--what-kinetic-friction-depends-on)).
  - Note: this gives 0.059 m/s² of deceleration on a flat blade. Air drag gives the same at about
    3.2 m/s ([gate O4](fidelity-gate.md#o4--speed-decay)).

- **`muEdgeGain`** — extra friction per (1 − cos θ): what a deep edge costs in speed
  - Value: `0.6`
  - Used: `blade.ts` `muLong`
  - Level: L2
  - Range: none recorded
  - Fixed by: `glide_decel_ms2` on a held deep edge against a flat at the same speed, on the same ice

- **`muSkid`** — friction once the edge has let go
  - Value: `0.35`
  - Used: `blade.ts` `muLong`; `solver.ts` `step` (skid scrub, brake), and with `slipMode` 1 the scrape (`scrapeShare`)
  - Level: L2
  - Range: none recorded
  - Fixed by: stopping distance from a known speed in a hockey stop or snowplough (footage timing)
  - Source: the bible and `SkateSolver.cpp` (the engineering package said 0.03)

- **`scrapeRefTilt`** — the edge at which a sideways scrape runs at exactly `muSkid`
  - Value: `0.6` rad (34°)
  - Used: `solver.ts` `scrapeShare`, `scrapeForce`, and the balance controller while scraping (`slipMode` 1 only)
  - Level: L3, authored
  - Range: none recorded
  - Meaning: a sliding blade keeps `muSkid / (biteC0 + biteC1 sin scrapeRefTilt)` of its grip curve (0.17 at the defaults), so a deeper edge dug toward the travel scrapes harder, up to about 0.55 g at `maxTilt`; a flat blade barely scrapes; the other edge catches with all its bite (a trip)
  - Measured (Simulation params, 90° across, lean 0.3 into it): 5 m/s stops in 1.63 s over 5.26 m; 7 m/s in 2.16 s over 9.02 m
  - Fixed by: a hockey stop's stopping distance and body lean from a known speed (footage timing), with `muSkid`

- **`bladeLength`** — a figure blade's length; the lever of THE DIG
  - Value: `0.28` m
  - Used: `solver.ts` `slipSolve` (`slipMode` 1 only): a scraping blade's sideways force acts `(contactS - 0.5) x bladeLength` ahead of the boot's centre, and r x F winds the body into `spinCarry`, which the takeoff carries (`jump.ts`)
  - Level: L2 — figure blades run 270–300 mm by boot size; the boot centre as the body's axis is the model's simplification
  - Measured (Simulation params, leaned in, 90°, 5 m/s, 0.3 s on the toe): +1.28 rad/s wound; 6 m/s, 100°, 0.1 s dig then 0.3 s load, no arms: takeoff L 6.5 since /29 (5.0 before a scraping blade stopped steering; full arms give 38)
  - Fixed by: a skater's measured takeoff angular momentum off a skidded or toe-dug entry, against the same entry held clean

- **Stage C1, the trunk** (`torqueMode` 1, with `slipMode` 1; `solver.ts` `trunkTorque`, `pivotCapacity`)
  - `lowerBodyInertia` `0.4` kg m² — hips, legs, skates about the long axis. Authored; the upper body is the rest of `inertiaTucked`…`inertiaOpen` by carriage
  - `twistMax` `0.8` rad — shoulders against hips at full wind-up (~45°). Authored
  - `twistTorqueMax` `60` N m — the trunk rotators' ceiling for a small skater. Authored
  - `twistStiffness` `600` N m/rad, `twistDamping` `60` N m s/rad — the trunk's PD toward the asked wind-up. Authored
  - `contactDepth` `0.00018` m, `rutWidth` `0.00416` m, `rutLoad` `755.4` N — the measured hockey rut (LEVER 2022, [ice-literature](ice-literature.md): 0.18 mm deep, 4.16 mm wide, 77 kg). Since /34 the rut's cross-section scales with this blade's load, spread flat across the width or cut as a wedge on an edge, depth √(2·area·tan tilt), whichever is deeper; the chord 2√(2ρ·depth), pivot grip = biteCapacity × chord / 4. Constant indentation pressure is a simplification the paper cautions on (p. 340)
  - Level: L3 except `contactDepth` (L2, hockey transfer)
  - Measured (Simulation params, 6 m/s): a slow wind-up on a lean-0.4 edge winds 0.80 rad with the feet held; a flick on a flat blade pivots the feet ~25° the opposite way; on an edge the toe pivots further than the heel (lean 0.2: 22° vs 19°)
  - Fixed by: shoulder-hip separation and skid onset from video of wind-ups and three-turn preparations
  - Model limit: the carve's own turning is the legs' (not charged to the pivot grip) — a momentum-true version where all turning comes through the ice cannot carve at any contact depth up to 2 mm (measured)

- **The free leg** (`freeLegMode` 1, with `torqueMode` 1; `solver.ts` `freeLegTorque`; on in Experimental only)
  - `freeLegMass` `0.161` — one leg's share of body mass: thigh 0.100 + shank 0.0465 + foot 0.0145 (Dempster, via Winter). Level L1 (anthropometry)
  - `freeLegReach` `0.4` m — the leg's centre from the body's axis, swung out. Authored
  - `freeLegArc` `1.2` rad — half its arc round the body. Authored
  - `freeLegStiffness` `150`, `freeLegDamping` `20`, `freeLegTorqueMax` `100` — the hip's PD (damping on the difference from the asked swing speed) and ceiling. Authored
  - **`freeLegTorqueMax` status: AUTHORED, UNVALIDATED** (operator, 2026-09-25). 100 N m; 76.5 N m on the cohort calibration body (1.63 N m/kg). It saturates for 45-74% of the 2Lo's 0.25 s push under `freeLegSwingThroughMode` (`test/swing-through.ts`); saturation alone does not show it is too low. Operator-cited context, not yet checked here: dynamic hip-flexion torques in trained sprinters ~1.65-1.98 N m/kg (a different motion), and ~275 N m peak hip moments in a skating jump's support-leg push (not the free leg). Do not raise or lower it before free-leg hip kinetics in skating are sourced.
  - When the foot pivots, the leg's reaction turns the braced torso with the hips (lower + upper as one body); a light lower body alone was kicked into a skid by a gentle swing
  - Measured (7 m/s, lean 0.9, eased 0.5 s swing): salchow (right leg free) L 10.58 → 12.08; loop (left leg free, swings clockwise) 10.58 → 9.08; the same swing over 0.3 s twists the blade loose and falls; over a shallow edge (lean 0.5) any swing skids it
  - Fixed by: free-leg angular velocity at takeoff from motion capture, against the takeoff edge's depth
  - Stage C2: the legs steer only a weighted foot — engagement is smoothstep(0.3 g, 0.8 g) of the support blade's load (authored; tying it to edge depth made the balance loop's own counter-steer into carried spin and the skater fell, measured). Under an unweighted foot the body keeps its spin. The trunk's PD is solved implicitly (explicit damping overshot with the feet free). Measured: carve at lean 0.5, shoulders led then released on a 0.15 s rise — blades 34° across, back in line on the sink; a smooth 0.2 s wind-up release on a lean-0.5 edge takes the jump's L from 4.61 to 8.57, a snapped one drops it to 2.38. A full 90° hockey stop needs hip rotation of the feet (stage B2)

- **Stage B2, the feet** (`footMode` 1, with `slipMode` 1; `solver.ts` `legTurns`, `footTangent`, `slipSolveFeet`)
  - `turnout` `0.5` — external hip rotation as a fraction of 90° per foot; the bible's §4.3 body setting, and `data/motion-primitives.json`'s spread eagle asks 0.75. 0.5 for the reference skater is authored
  - `hipInternal` `0.6` rad (~35°) — how far a foot turns in. Authored
  - `footTurnRate` `6` rad/s — how fast the legs turn a foot. Authored
  - Level: L3
  - Measured (Simulation params, 5 m/s): snowplow, full toe-in on inside edges 0.6 — stops in 5.42 s over 14.1 m, straight; T-stop at turnout 1, drag on a full outside edge with 30% of the weight — 3.54 s over 10.1 m; spread eagle body sideways — turnout 1 glides clean, 0.75 scrapes to 3.68 m/s, 0.5 to 3.46 after 6 s
  - Fixed by: turnout from the skater (goniometry, or the spread eagle's foot angle on video); stopping distances from footage of the three stops
  - Model limit: with `pitchMode` 0 (Blade Explorer, Full Repertoire) there is no fore-aft pendulum — a snowplow on outside edges catches both and stops dead in 1 s without pitching the skater forward. See `pitchMode` below

- **`pitchMode`** — the fore-aft pendulum (`solver.ts` `pitchTick`; big_reffg.txt §3.5, the lateral pendulum's mirror along the support blade). **On in Simulation and Experimental** (the operator's choice, 2026-09-23), 0 in Blade Explorer and Full Repertoire
  - The ankle's only authority is the contact along the blade, clamped to half of `bladeLength` (0.14 m, authored); it steers by the capture point (Pratt 2006, Hof 2008). Falls (`FALL.Pitched`) when the capture point sits off the blade for `fallErrorTime` (0.35 s, the lateral timeout's, reused)
  - Only forces along the blade pitch the body: the push, drag and the rink's slope act through the hips and body; an edge's hold and a skid's friction (`muSkid`, the scrub, the brake) act across the blade. Pivots and spins keep pitchMode 0's direct placement (model limit)
  - `pitchGain` `1` — how hard the ankle draws the capture point to the asked lean (1 = the pendulum's own rate, sqrt(g / L)). Authored
  - Level: L3
  - Measured (`test/pitch.test.ts`, Simulation params, 5 m/s): glides and strokes hold the contact within 1.5 cm of centre; pitch 0.5 settles at contactS 0.75 (pitchMode 0's placement); the full inside-edge snowplow stops upright, leaning back 0.069 rad; both outside edges caught, 2–5 m/s, pitch the skater forward and down at 0.39 s
  - Measured on in Simulation and Experimental (pinned in the skill tests): the hockey stop scrapes to 1 m/s 1.47 s after the rise (1.60 without), then the bot's glide with blades in line takes it to a standstill at 6.30 s (4.31 without); the pad snowplow on outside edges pitches the skater forward 0.35 s after the edges are set; Experimental's jump takeoffs lose 1–2% of their spin (backward loop L 38.7 → 37.2, the deep-edge loop 10.58 → 10.51) as the heel dig now leans the body rather than placing the contact; with `speedSpinMode` the lutz's block gives 1.08 instead of 2.26
  - Forced on everywhere (the stripped test bases keep it off): the dig no longer winds the body — the ankle cannot put the contact on the toe at once, since leaning toward the toe first moves it toward the heel; the heel/toe carve and toe-pivot tests move with the contact's lag
  - Fixed by: centre-of-pressure traces from instrumented skates (braking, stroking, a snowplow); the ankle's reach under a skate boot
  - **The dig under the pendulum** (the operator's call, 2026-09-24: **lean early**; no physics change). The dig pushes where the ankle has the contact. A lean asked at the dig first runs the contact the other way (a step 0 → 0.75 at 5 m/s: to contactS 0.126 at once, within 0.01 of the asked at 1.30 s), so a late toe dig winds the body backward (−0.207, takeoff L 0). Leaned 1.5 s early the contact is at 0.85 and the dig winds +1.005, a lutz with L 5.09 — 85% of the same dig without the pendulum (1.075, L 5.93). A toe lean a forward glide can hold is 0.75: 0.8 reaches the pick (`toePickMode`). Pinned in `test/dig.test.ts`
  - Observability: `SkaterState.contactAsked` (per blade, what the input asked) and `digL` (the blades' winding this tick, N m s), pitchMode 1 only; the telemetry CSV's `L_contact`, `L_contact_asked`, `R_contact`, `R_contact_asked`, `dig_Nms`; the lab's overlay rings the asked contact on each blade and lights `DIG ↺/↻` on the HUD while the dig winds
  - **`pitchGain` is global, not the dig's.** Calibration sweep (`node tools/ice-lab/test/pitch-gain-sweep.ts`, 2026-09-24): the contact's first excursion on a toe step / arrival / late winding / late dig L / early dig L — gain 0.5: 0.317 / 2.38 s / −0.167 / 0 / 4.71; **1: 0.126 / 1.30 s / −0.207 / 0 / 5.09**; 2: 0.000 / 0.74 s / −0.168 / 0.52 / 5.12; 3: 0 / 0.56 s / −0.147 / 0.85 / 5.12; 5: 0 / 0.41 s / −0.119 / 1.15 / 5.13. Five-fold gain gives back L 1.15 of the late dig and moves everything else — a low-leverage knob for the dig. `test/pendulum-fingerprint.test.ts` pins the gain-1 row plus two stops (snowplow lean-back −0.069, caught edges down at 0.392 s); a gain or pendulum change fails there first

- **`digOracle`** — TEST / DEBUG ONLY, 0 in every setup. 1 (with `pitchMode` 1): the dig pushes where the input asked for the contact instead of where the ankle has it — the pre-pendulum dig, kept to show why its numbers cannot stand: toe 0.8 leaned late, it winds +1.278 and gives the lutz L 6.71 while the contact the blade actually meets the ice at averages 0.37, the heel half (`test/dig.test.ts`)

- **`pitchInternalMode`** — the arms and trunk in the fore-aft pendulum (`solver.ts` `pitchTick`). Counter-rotation (Hof 2007) turns the body over the blade without moving the contact and without any force from the ice. The contact demand is split by speed, as a standing human splits it (Horak & Nashner 1986: ankle for slow, hip for fast): the ankle follows it over `pitchAnkleTau`, the arms take the fast rest within what of `internalMax` the lateral balance leaves them (one pair of arms, one vector); the pitch fall allows `fallAuthorityCredit` of the arms' reach. **On in Simulation, Experimental and Dig Gate** (2026-09-24), 0 in Blade Explorer and Full Repertoire
  - `pitchAnkleTau` `0.16` s — the crossover, 1/(2π · 1 Hz); the crossover frequency authored. Swept: 0.1 s: the contact still swings 4.4 cm the wrong way and releasing a lean still trips a (forced-on) pick; **0.16: 3.4 cm, arrives in 1.30 s, no release trip, early dig L 5.30**; 0.25: 1.49 s; 0.5: 2.13 s, dig L 4.93; the lateral washout's 1.5 s: 4.97 s and the arms hold the lean for seconds, dig L 3.06
  - Level: L3
  - Measured (`test/arms.test.ts`): a toe lean asked at 5 m/s — the ankle alone runs the contact 10.4 cm toward the heel first and arrives at 1.08 s; with the arms 3.4 cm, 1.30 s; 2 s into a held lean the arms carry almost nothing. Letting go of a 0.6 lean at once at 5 m/s: the ankle alone trips a forced-on toe pick, with the arms it does not
  - Re-pinned in the setups (old figures beside the new in each test): hockey stop scraped to 1 m/s 1.47 → 1.57 s; loop L at 7 m/s 10.51 → 10.55; backward double loop L 37.2 → 37.5; lutz block (speedSpinMode) 1.08 → 1.20; Dig Gate's dig at 1.50 → 1.70 s; caught outside edges on the pad down at tick 171 → 176
  - Fixed by: centre-of-pressure and trunk-angle traces from skaters changing lean at speed

- **`toePickMode`** — the toe-pick trip (`solver.ts` `toePickCatch`; big_reffg.txt §3.5 and EDGE-005: s ≥ s_toe with v∥ > v_trip → trip). A loaded blade whose contact sits at least `toePickEngage` toward the toe while it travels toward its toe faster than `toePickTripSpeed` raises `FALL.ToePickTrip` with an `EVENT.ToePickCatch`. Needs `pitchMode` 1 (without the pendulum the body has no fore-aft lean to throw over the pick) and skips pivots and spins. **0 in every setup**: on in Simulation and Experimental the morning of 2026-09-24, switched off that afternoon on the operator's word after play ("not working at all", "makes pumping completely useless"). The instant ankle counter-move throws the contact onto the pick whenever a lean is changed quickly at speed — releasing a forward lean of 0.5+ within 0.1 s, or 0.75 even eased over 0.4 s, tripped (measured, 3 and 5 m/s); `pitchInternalMode` (unfinished) removed those trips in a probe
  - `toePickEngage` `0.11` m from the blade's centre — big_reffg.txt's `ToePickEngagePos`, authored there; with `bladeLength` 0.28 it is contactS 0.893, pitch 0.786 asked
  - `toePickTripSpeed` `1.5` m/s along the blade — big_reffg.txt's `ToePickTripSpeed`, authored there
  - Level: L3
  - Measured (`test/toepick.test.ts`): a full forward lean trips at 0.725 s from 1.6, 3 or 6 m/s, not at 0.5 or 1.4 m/s, never backward; pitch 0.75 skates the front of the rocker freely. Both outside edges caught from 2–5 m/s: the ankle drives the contact onto the pick in two ticks and it catches at 0.025 s (1–1.5 m/s: still `Pitched` at 0.39 s)
  - Forced on everywhere: only those outside-edge catches, the pad snowplow in Simulation, and Experimental's thumb stroke move. The thumb stroke pulls one stick full back (pitch −0.5, pitchSplit −0.5); to lean the body back the ankle first moves the shared contact 7.9 cm toward the toe, and the split puts the other blade on its pick — a trip at 3 m/s in under 0.03 s. That is the pendulum's instant counter-movement, not the pick's
  - On in the setups (pinned in `test/setups.test.ts`): the operator kept the stroke's trip as a skill and asked for a forgiving stroke — `STROKE_EDGE` 0.6 → 0.5, full range at a sweep of `STROKE_FULL` 1.2 (was 2, bottom to top), `STROKE_WOBBLE` 0.2 of side-to-side free, full quickness at `STROKE_SNAP_TICKS` 12 (was `SNAP_TICKS` 6) — all authored. A firm 75%-to-75% stroke pushes 0.99 (3.171 m/s from 3 since the stroke extends from a full bend, `STROKE_KNEE` 1, authored; was 2.985 from the released trigger's 0.35 floor; the old full stroke 2.987) and never trips; past ~85% down, or from 80% down to the top, it trips at every speed above 1.5 m/s. The pad snowplow on inside edges holds when its edges are set over 0.1 s or more (3–7 m/s); slammed on in one tick it trips 2 ticks later. Outside edges caught on the pad: tripped at tick 131 (was pitched at 162). Rocking back in Simulation (both sticks to the heel): a yank — 90% or more in one tick, or full within 0.1 s — trips at 3–7 m/s, since the ankle leans the body back by first driving the contact toward the toe; eased over 0.2 s, or to 80%, it holds. Also why a heel lean begun early before a dig trips
  - Model limits: the ankle moves the contact in one tick (no latency or rate limit); the pick is a threshold, not a contact that can stop a slow skater or be skated on
  - Fixed by: the pendulum's contact traces (above); the pick's height and the boot's forward flex

 — the takeoff's block as a torque (r × Δp, r = leg length × sin(lean) to the side). No new constant. **0 in every setup**, by measurement: on a curve the body is inside and the blade outside, so the block swings the body *against* the curve — it cancels a loop's, salchow's, toe loop's, flip's and axel's curve rotation at 5–7 m/s (loop off RBO at 5 m/s: L 3.01 → 0) and feeds only the counter-rotated lutz (8 m/s: 0 → 1.94). Turning approach speed into rotation *with* the curve needs another mechanism — the free leg and arms swinging through, or a pick planted to the other side — not yet modelled
  - Since /29: a scraping blade does not steer (it is not rolling along its arc), and with the trunk the scraping feet check the body's extra spin through friction at their offsets (stance width, heel/toe). Rising off a carve with the feet turned brings the blades 84° across and scrapes 6 → ~1 m/s; with fixed inputs the skater still falls as the stop runs out. Finished in `test/hockeystop.test.ts` with no further solver change: the blades must be held square (a scrape short of square lets the travel slide along the blade and swing into line), feet first then hips, and the entry lean kept inside the scrape's ceiling (~0.5 rad). Entry 0.4 stops from 6 m/s 2.99 s after the rise and stands; entry 0.5 falls

- **`biteC0`** — lateral holding capacity of a flat blade, per unit load
  - Value: `0.08`
  - Used: `blade.ts` `biteCapacity`, `skidOnsetSpeed`
  - Level: **L3**. The bite law's form is described in the code as a caricature of an interlock.
  - Range: none recorded
  - Fixed by: `carve_held` at shallow edges
  - Source: the engineering package

- **`biteC1`** — holding capacity per sin|θ|
  - Value: `3.5`
  - Used: `blade.ts` `biteCapacity`, `skidOnsetSpeed`
  - Level: **L3**. Above about 1 this is not Coulomb friction; the code models it as the edge
    pushing against the wall of its groove.
  - Range: none recorded
  - Fixed by: `carve_held` on deep edges at high speed. With `rocker`, it predicts that no deep edge
    skids below about 8.4 m/s. A clean held edge faster than that, or a skid slower on good ice,
    tests it directly.
  - Source: the engineering package

### Rink shape

- **`rinkRelief`** — centre ice minus the boards: + a crown (convex), − a bowl (concave)
  - Value: `0` in every preset. The lab's named shapes (`RINKS`): public `+0.0045` m, barn `−0.009` m.
  - Used: `blade.ts` `rinkSlopeAccel`; `solver.ts` `step` §5, along the travel only, skipped at 0
  - Level: **L3**. The shapes are the owner's field observations. The magnitudes were chosen as "barely
    perceivable": the pull at the side boards is 10% (public) and 20% (barn) of flat-glide friction.
  - Range: ±0.05 m (`validate`, `parseReplay`)
  - Fixed by: a surface survey of a named rink (laser level, water level, or string line), and paired
    opposite-direction glide cases on it. A **measured** relief is a venue input to its case, like air
    density ([gate §3](fidelity-gate.md#3--the-configuration-under-test)), not a tuning.

- **`rinkHalfLength`**, **`rinkHalfWidth`** — the sheet, centred on the origin
  - Value: `30`, `15` m (a 60 × 30 m sheet)
  - Used: `blade.ts` `rinkSlopeAccel`. Inert while `rinkRelief` is 0.
  - Level: L1 as a sheet size. The paraboloid shape between the boards is **L3**.
  - Range: > 0
  - Fixed by: the venue's dimensions, as a case input

### Ice wear

`sim/ice.ts`'s `IceGrid`, design-bible §3.2. All four are inert at `iceGridMode` 0 (every preset) or with
no grid passed into `step()` at all, and none has a data file behind it — every level below is L2 or L3.

- **`iceGridMode`** — 0 the sheet never wears, 1 every blade pass writes and reads it back
  - Value: `0` in every preset
  - Used: `sim/solver.ts` `step`, gating whether `IceGrid.condition`/`deposit` are ever called
  - Level: L1, a switch rather than a measurement
  - Range: `{0, 1}` (`validate`)
  - Fixed by: not physical. It is a gate on the mechanic, the way `movesMode` is.

- **`iceDamagePerPass`** — local wear one blade pass adds, saturating at 1
  - Value: `0.004` (~250 passes over one cell to fully chew it)
  - Used: `sim/ice.ts` `IceGrid.deposit`
  - Level: L3
  - Range: `(0, 1]` (`validate`)
  - Fixed by: a warm-up group's measured glide loss, skater by skater, on a sheet timed since its last
    resurfacing — the bible's own example of what this constant is for.

- **`iceSnowPerScrub`** — snow deposited per (m/s² of skid scrub) × dt
  - Value: `0.05`
  - Used: `sim/ice.ts` `IceGrid.deposit`, fed `latSlipAccel` from `sim/solver.ts` step 3
  - Level: L3. Reuses the same excess-acceleration quantity step 5 already scrubs off as speed
    ("mu_skid * excess * dt is a speed decrement, which is where the snow comes from") rather than
    inventing a second model of where snow comes from.
  - Range: ≥ 0 (`validate`)
  - Fixed by: a measured snow ridge's depth against a skater's recorded hockey-stop scrub

- **`iceMuChewed`** — longitudinal glide friction at full local wear
  - Value: `0.015`
  - Used: `sim/blade.ts` `muLong`, blended with `muGlide` by local `condition`
  - Level: L2. The bible gives this number directly: "rising toward 0.015 on soft or chewed ice."
  - Range: ≥ `muGlide` (`validate`): chewed ice cannot be slicker than fresh
  - Source: design-bible.md §3.2

- **`iceBiteLossMax`** — share of bite capacity full local wear removes
  - Value: `0.35`
  - Used: `sim/blade.ts` `biteCapacity`
  - Level: L3. The bible states the direction ("damage... lowers bite") but not a number.
  - Range: `[0, 1]` (`validate`)
  - Fixed by: `carve_held` on a known-chewed patch against fresh ice at the same lean and speed

---

## 2 · Air and body

- **`cdA`** — drag area, upright
  - Value: `0.495` m² for the reference skater. The profile scales it by √(mass × height)
    relative to the reference.
  - Used: `solver.ts` `step` §5; `jump.ts` `jumpAir`; `moves.ts` `pivotStep`; `profile.ts`
    `applyProfile`
  - Level: L2. The √(mass × height) scaling is also L2.
  - Range: none recorded
  - Fixed by: `glide_decel_ms2` at high speed (above about 6 m/s, where drag dominates), with
    `muGlide` fixed first from low-speed cases
  - Source: the bible (the engineering package said 0.45)

- **`mass`** — the reference skater's mass
  - Value: `55.0` kg (`REFERENCE_MASS` in `profile.ts`)
  - Used: throughout `solver.ts`, `jump.ts` and `moves.ts`
  - Level: L2 as a reference. A case supplies the real skater's mass, so this is not moved to fix a case.
  - Range: 30–120 kg, the profile validator's span
  - Fixed by: not by a case. It is an input.

- **`comHeight`** — centre-of-mass height standing, for the reference height
  - Value: `0.95` m at `REFERENCE_HEIGHT` `1.65` m, scaled linearly with height by the profile
  - Used: `solver.ts` `createState`, `step` (pendulum length); `profile.ts` `applyProfile`
  - Level: L2
  - Range: none recorded
  - Fixed by: anthropometric segment tables, plus boot and blade height. It then enters `carve_lean_deg`
    through r<sub>b</sub> = r<sub>c</sub> + L sin φ.

- **`stanceHalfWidth`** — half the distance between the feet, two-footed
  - Value: `0.12` m
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: none recorded
  - Fixed by: footage of two-footed glides. It matters for stance authority, not for any §4 observable
    directly.

- **Jump impulse mass scaling** — `jumpImpulse` × √(55 / mass), constant leg drive per kilogram
  - Used: `profile.ts` `applyProfile`
  - Level: L2
  - Fixed by: `jump_reachable` across skaters of different mass

---

## 3 · Balance and control

**This is a model of the skater's control, not of the ice.** None of these constants has a camera
observable of its own. They are constrained only indirectly: whether a steady window is reached
([gate §4.4](fidelity-gate.md#44--steady-windows)), how much of the carve envelope is reachable
(`carve_held`), and whether an element can be completed at all (`jump_reachable`,
`propulsion_reachable`). A controller constant should be the **last** thing moved to fix a case,
because it can hide a physics error behind a skater who compensates.

- **`maxLean`**, **`maxTilt`** — body lean and blade tilt limits
  - Value: `1.13`, `1.13` rad (about 65°)
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: none recorded
  - Fixed by: the deepest lean in footage of a held edge (`carve_lean_deg` on the most extreme cases)
  - Source: the bible, "where the blade washes out" (the engineering package said 1.05 or 0.96)

- **`balanceKp`** — lean controller proportional gain
  - Value: `39.0`
  - Used: `solver.ts` `step` §2
  - Level: L2
  - Range: must exceed g, or the lean loop is unstable (`validate`, L0 control theory). No upper bound
    recorded.
  - Fixed by: indirect only

- **`balanceKd`** — lean controller rate gain
  - Value: `8.0` spec, **`16.0` responsive**
  - Used: `solver.ts` `step` §2
  - Level: L2
  - Range: > 0. None recorded above that.
  - Fixed by: indirect only. The time to settle onto a commanded edge is visible on footage but mixes
    skill and physics.

- **`angulationLimit`** — how far blade tilt may differ from body lean
  - Value: `0.35` rad spec, **`0.70` rad responsive**
  - Used: `solver.ts` `step` §2
  - Level: L2
  - Range: none recorded
  - Fixed by: `angulation_deg` (L3 measurement). Indirectly, `carve_held` at low speed and tight
    radius, where the rigid rocker demands more tilt than lean.

- **`controlLatency`** — first-order lag on the tilt command
  - Value: `0.12` s
  - Used: `solver.ts` `step` §2
  - Level: L2
  - Range: none recorded. Human reaction and neuromuscular delay literature would bound it.
  - Fixed by: indirect only

- **`internalGain`**, **`internalRateGain`**, **`internalWashout`**, **`internalMax`** — balance
  authority from the arms and free leg
  - Value: `6.0`, `0.0` spec / **`2.0` responsive**, `0.0` spec / **`1.5` s responsive**, `1.5` m/s²
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: `internalRateGain` ≥ 0, `internalWashout` ≥ 0. `internalMax` above 2 needs a rate term
    (`validate`, measured on this rig). No physical range recorded.
  - Fixed by: indirect only

- **`copGain`**, **`copRateGain`**, **`copCommandShare`** — two-footed stance authority
  - Value: `12.0`, `0.0` spec / **`2.0` responsive**, `0.0` spec / **`1.0` responsive**
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: `copRateGain` ≥ 0; `copCommandShare` in [0, 1] by definition
  - Fixed by: indirect only

- **`splitTiltMax`** — tilt difference between the blades at full split deflection
  - Value: `0.35` rad
  - Used: `solver.ts` `step`. Inert unless that input axis is driven.
  - Level: L2
  - Range: none recorded
  - Fixed by: not currently exposed to any observable

---

## 4 · Legs and stroke

Structure: the bible's semi-analytic push, not a leg model. Observable class O7.

- **`strokePower`** — peak push acceleration at full knee
  - Value: `3.2` m/s²
  - Used: `solver.ts` `step` §5b
  - Level: L2
  - Range: none recorded
  - Fixed by: `propulsion_reachable`, and `stroke_gain_ms` from literature that reports effort

- **`strokeBeta`** — how far the pushing blade is splayed from the line of travel
  - Value: `0.65` rad (about 37°)
  - Used: `solver.ts` `step` §5b
  - Level: L2
  - Range: (0, π/2) by definition
  - Fixed by: blade angle to the path during a push, from overhead footage

- **`strokeDuration`** — length of one push
  - Value: `0.30` s
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: none recorded
  - Fixed by: frame count of blade contact during a push

- **`strokeEdge`** — the inside edge the pushing blade rolls onto
  - Value: `0.35` rad
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: must exceed `flatThreshold` (`validate`)
  - Fixed by: close footage of the pushing boot

- **`backPushScale`** — a backward push as a share of the same push forward
  - Value: `0.91`
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: (0, 1] per `validate`. That bound encodes a design claim and is not evidence.
  - Fixed by: `crossover_gain_ms` forward against back, on the same skater
  - Source: 1.05 / 1.15 from `data/motion-primitives.json`

- **`crossoverLean`** — tilt command above which a push counts as a crossover
  - Value: `0.21` rad (12°, the shallow-edge boundary)
  - Used: `solver.ts` `step`
  - Level: L2
  - Range: must be at least `flatThreshold` (`validate`)
  - Fixed by: not a physical quantity. It classifies intent.

- **`kneeRate`**, **`kneeSpring`**, **`kneeDamping`**, **`maxKneeCompression`** — the leg
  - Value: `3.5` /s, `120.0`, `18.0`, `0.25` (share of `comHeight`)
  - Used: `solver.ts` `step` §1; `jump.ts` `jumpAir` (`kneeRate`)
  - Level: L2
  - Range: `kneeRate` > 0. None recorded otherwise.
  - Fixed by: `maxKneeCompression` from knee bend depth in footage, as a drop in hip height. The
    others are indirect.

- **Neutral stance knee** — knee input the rig rests at, and the floor during a stroke
  - Value: `0.35`
  - Used: `solver.ts` `step`; `jump.ts` (default knee)
  - Level: L2
  - Range: none recorded
  - Fixed by: indirect only

---

## 5 · Falls

- **`fallLean`**, **`fallError`**, **`fallErrorTime`**, **`fallAuthorityCredit`**
  - Value: `1.13` rad, `0.35` rad, `0.35` s, `0.0` spec / **`1.0` responsive**
  - Used: `solver.ts` `step` §9; `jump.ts` `land` (`fallError`)
  - Level: L2
  - Range: `fallAuthorityCredit` in [0, 1] by definition. None recorded otherwise.
  - Fixed by: no §4 observable. A fall invalidates a steady window and fails `carve_held`, so these
    matter only at the edge of the envelope.

---

## 6 · Jumps: flight and inertia

Structure S6. Observable classes O5 and O6.

- **`jumpImpulse`** — vertical takeoff velocity at a perfect takeoff
  - Value: `2.94` m/s. That gives 0.60 s of air and 0.44 m of rise (L0 ballistics).
  - Used: `jump.ts` `jumpGround`; `profile.ts` `applyProfile`
  - Level: L2
  - Range: none recorded
  - Fixed by: `jump_reachable`. Air time from frame counts gives v<sub>z</sub> = g t / 2 directly.
  - Source: the bible, "a clean triple"

- **`jumpSpeedShare`** — share of the lift that comes from approach speed, with moves on
  - Value: `0.2`
  - Used: `jump.ts` `jumpGround`
  - Level: **L3**. The code labels it a balance lever.
  - Range: [0, 1] by definition
  - Fixed by: `jump_reachable` against entry speed, across footage of the same jump at different speeds

- **`ENTRY_SPEED`** — per jump T, S, Lo, F, Lz, A: the speed at which the approach contributes
  exactly its share
  - Value: `6.8, 6.6, 6.4, 7.0, 7.5, 7.8` m/s
  - Used: `jump.ts` `jumpGround`
  - Level: L2
  - Range: none recorded
  - Fixed by: entry speed measured on footage of clean triples
  - Source: `data/entry-templates.json`, transcribed and tested against it

- **`jumpWhip`**, **`jumpRotBias`** — rotation from a full carriage whip, and the share of entry
  yaw rate that becomes rotation
  - Value: `9.5` rad/s, `1.0`
  - Used: `jump.ts` `jumpGround`
  - Level: L2
  - Range: none recorded
  - Fixed by: `jump_reachable`: the revolutions a clean jump turns, given its measured air time
  - Source: `JumpResolver.cpp` (`jumpWhip`)

- **`inertiaOpen`**, **`inertiaTucked`** — moment of inertia about the vertical, arms open and drawn in
  - Value: `4.0`, `0.95` kg·m², a pull-in ratio of 4.2
  - Used: `jump.ts` `newJump`, `jumpGround`, `jumpAir`, `land`; `moves.ts` `spinStart`, `spinTick`
  - Level: L2. Their ratio is what a camera sees (L0, [gate O6](fidelity-gate.md#o6--moment-of-inertia)).
  - Range: `inertiaTucked` in (0, `inertiaOpen`] by definition. None recorded otherwise.
  - Fixed by: `pull_in_ratio` from frame counts. Absolute values need anthropometric segment
    modelling or literature, because a camera only gives the ratio.
  - Source: the bible

- **`inertiaPullRate`** — rate the arms change inertia
  - Value: `11.0` kg·m²/s
  - Used: `jump.ts` `jumpAir`; `moves.ts` `spinTick`
  - Level: L2
  - Range: none recorded
  - Fixed by: frames from takeoff to fully tucked, on footage
  - Source: `JumpResolver.cpp`

- **`jumpAssist`** — how much of the arms a wound-up jump flies for the skater
  - Value: `0.25` spec, **`0.5` responsive**, `0.8` assisted. Spec's value is the operator's override
    (2026-09-13). The engineering package has no assist, which is 0.
  - Used: `jump.ts` `jumpGround` (the whip floor), `jumpAir` (the blend), `assistedCarriage`
  - Level: **L3**. It is a control assist, not a property of skating. What it may move is bounded by L0:
    only I, at the arms' rate, with angular momentum conserved.
  - Range: [0, 1] by definition
  - Fixed by: no physical observable. It must not change any gate observable, because cases never wind up.
    A playtest question, not a fidelity one.

- **`windupThreshold`**, **`windupWindow`** — how far the flick must go, and how long before the release it
  still counts
  - Value: `0.6` of the stick, `0.6` s
  - Used: `jump.ts` `jumpGround`
  - Level: L3
  - Range: threshold in (0, 1]; window at least two ticks (`validate`)
  - Fixed by: not physical. It is an input gesture. The window could be informed by how long before
    takeoff skaters counter-rotate the shoulders on footage.

- **Assist geometry** — hard-coded in `jump.ts`: the target is the nearest whole revolution (half for an
  axel) to the fully tucked reach, and the arms are found by 12 bisection steps. L3, and a design choice.

- **`toeWindow`** — time either side of the release in which a toe strike counts as the pick
  - Value: `0.09` s
  - Used: `jump.ts` `jumpGround`
  - Level: L2
  - Range: none recorded
  - Fixed by: frames between the pick and the release on footage of toe jumps
  - Source: the bible

- **`jumpLoadKnee`**, **`jumpReleaseKnee`**, **`jumpLoadMax`** — what counts as a load and a release
  - Value: `0.7`, `0.45`, `1.0` s
  - Used: `jump.ts` `jumpGround`
  - Level: L2
  - Range: release below load (`validate`)
  - Fixed by: not physical. These classify an input gesture.

- **`landingShock`** — lean rate a zero-quality landing kicks into the body
  - Value: `1.5` rad/s
  - Used: `jump.ts` `land`
  - Level: L2
  - Range: none recorded
  - Fixed by: no §4 observable

---

## 7 · Jump quality shaping

Hard-coded in `jump.ts`, carried from `JumpResolver.cpp`. They shape quality, which then scales lift
and rotation, so they reach `air_time_s` and `revolutions_turned`. **All L3.** The code notes they
shape quality rather than decide a call. None has a range recorded.

- **`IDEAL_LOAD`** — the best load time: `0.30` s
- **`PRE_ROTATION_RATE`** — pre-rotation penalty accrued past 1.6 × the ideal load: `2.2` /s. The
  1.6 factor is also a constant.
- **`PEAK_KNEE_FULL`** — knee depth that scores full: `0.85`
- **`SETUP_FLAT`** — mean outside-ness below which a setup reads flat: `0.15`
- **Takeoff quality weights** — timing `0.55`, depth `0.45`; edge-error penalty `0.35`;
  pre-rotation penalty `0.40`; missed pick `× 0.45`
- **Lift floor** — v<sub>z</sub> = `jumpImpulse` × (`0.62` + `0.38` q)
- **Rotation floor** — angular momentum × (`0.80` + `0.20` q)
- **Landing quality weights** — check error `0.90`, absorption `0.50`, edge `0.35`, balance `0.60`;
  `TWO_FOOT_PENALTY` `0.15`
- **Landing thresholds** — fall below quality `0.18` or short by more than `0.70` rev; step-out below `0.34`
- **`MIN_JUMP_REVS`** — below this it was a hop: `0.375` rev

Fixed by: `jump_reachable` constrains the lift and rotation floors from above. The rest have no
camera observable, and the gate should not be asked to fit them.

---

## 8 · Moves

All of these are inert with `movesMode` 0. Cases for turns, twizzles, spins and the Ina Bauer set
`movesMode` 1 ([gate §3](fidelity-gate.md#3--the-configuration-under-test)). **Every "Source" here is
project design data**, so every level is L2 at best.

### Turns

- **`turnTime`** — duration of a turn's pivot on the middle of the blade
  - Value: `0.30` s
  - Used: `moves.ts` `beginPivot`
  - Level: L2
  - Range: at least four ticks (`validate`)
  - Fixed by: frames through the cusp of a three-turn

- **`muTurn`** — scrape friction while a turning blade pivots across its path
  - Value: `0.20`
  - Used: `moves.ts` `pivotStep`
  - Level: **L3** (structure S7)
  - Range: none recorded
  - Fixed by: `turn_speed_loss_ms`
  - Source: calibrated to −0.45 m/s at 6 m/s, `data/motion-primitives.json`

- **`mohawkScrub`** — a mohawk's second half as a share of a three-turn's scrape
  - Value: `0.78`
  - Used: `moves.ts` `turnPivot`
  - Level: L3
  - Range: none recorded
  - Fixed by: `turn_speed_loss_ms` for mohawks against three-turns on the same skater
  - Source: −0.40 m/s, the same file

- **`choctawScrub`** — a choctaw's second half, on the new foot, as a share of a three-turn's scrape
  - Value: `1.65`
  - Used: `moves.ts` `turnPivot`
  - Level: L3
  - Range: none recorded
  - Fixed by: `turn_speed_loss_ms` for choctaws against mohawks on the same skater
  - Source: −0.55 m/s at 6 m/s, the same file (measured 0.548)

- **`turnMinSpeed`** — below this there is no edge to turn on
  - Value: `1.0` m/s
  - Used: `moves.ts` `turnStart`
  - Level: L2
  - Range: none recorded
  - Fixed by: not physical. It is a gate on the move.

- **`turnCarry`**, **`turnCarryTime`** — share of pivot rate kept as rotation a jump can take off
  with, and how fast it drains
  - Value: `0.11`, `0.5` s
  - Used: `moves.ts` `endPivot`, `carryDecay`
  - Level: L2
  - Range: `turnCarry` in [0, 1] by definition
  - Fixed by: `jump_reachable` for jumps entered from a three-turn

### Twizzles

- **`twizzleRate`** — rotation rate with arms in
  - Value: `16.0` rad/s (2.5 rev/s)
  - Used: `moves.ts` `twizzleTick`
  - Level: L2
  - Range: must turn less than a quarter revolution per tick (`validate`, numerical)
  - Fixed by: `twizzle_rate_rps`
  - Source: `data/motion-primitives.json`, two revolutions over 4.5 m at 6 m/s

- **`twizzleArmsOut`**, **`twizzleScrub`**, **`twizzleMinSpeed`**, **`twizzleSteerTime`**
  - Value: `0.5`, `0.75`, `2.0` m/s, `0.3` s
  - Used: `moves.ts` `twizzleStart`, `twizzleTick`
  - Level: L2 (`twizzleScrub` L3, calibrated to −1.0 m/s in the same file)
  - Range: `twizzleArmsOut` < 1. None recorded otherwise.
  - Fixed by: `twizzle_rate_rps` arms out against arms in; speed loss over a twizzle by footage timing

- **`TWIZZLE_SPINUP`**, **`TWIZZLE_SETTLE`** — hard-coded in `moves.ts`
  - Value: `0.15` s, `0.15` s
  - Level: L2
  - Fixed by: frame counts at entry. Low priority.

### Spins

- **`spinArm`** — lever arm turning entry travel into angular momentum: L = m v arm (0.7 + 0.3 check)
  - Value: `0.15` m. The `0.7` and `0.3` check weights are hard-coded in `moves.ts` `spinStart`.
  - Used: `moves.ts` `spinStart`
  - Level: L2
  - Range: none recorded
  - Fixed by: `spin_rate_rps` against measured entry speed

- **`SPIN_INERTIA_SCALE`** — inertia by position: upright, sit, camel
  - Value: `1.0, 1.25, 2.2`
  - Used: `moves.ts` `spinStart`, `spinTick`
  - Level: L2
  - Range: none recorded
  - Fixed by: `spin_rate_rps` ratios between positions in one spin, with angular momentum conserved
  - Source: `data/spin-positions.json`, transcribed and tested against it

- **`spinDecay`** — angular momentum a centred spin loses to the blade
  - Value: `0.12` /s
  - Used: `moves.ts` `spinTick`
  - Level: L2
  - Range: none recorded
  - Fixed by: `spin_decay_per_s`. Effort does not enter it, so this is one of the cleanest two-sided
    tests the corpus can hold.

- **`spinTravelDecay`**, **`spinTravelKeep`**, **`spinTravelTime`** — drift, and what it costs
  - Value: `0.5` /(m/s), `0.12`, `0.6` s
  - Used: `moves.ts` `spinStart`, `spinTick`
  - Level: L2
  - Range: `spinTravelKeep` in [0, 1] by definition
  - Fixed by: `spin_decay_per_s` on travelling spins against centred ones

- **`spinMinSpeed`**, **`spinMinOmega`**, **`spinExitSpeed`**
  - Value: `3.0` m/s, `3.0` rad/s, `2.0` m/s
  - Used: `moves.ts` `spinStart`, `spinTick`
  - Level: L2
  - Range: `spinMinSpeed` > 0
  - Fixed by: the slowest sustained spin rate before a skater exits, and exit speed, from footage
  - Source: `spinMinSpeed` from `data/spin-positions.json` entries

- **`spinSitKnee`**, **`spinCamelPitch`** — input thresholds selecting sit and camel
  - Value: `0.6`, `0.5`
  - Level: L2
  - Fixed by: not physical. These classify an input.

- **`SPIN_EDGE`**, **`SPIN_BLADE_SPEED`**, **`SPIN_SETTLE`** — hard-coded in `moves.ts`
  - Value: `0.26` rad, `0.5` m/s, `0.2` s
  - Level: L2
  - Fixed by: `SPIN_EDGE` from close footage of the spinning blade. The other two feed the classifier
    and the settle, and have no observable.

- **`spinReverseStick`**, **`spinReverseRate`**, **`spinReverseFloor`**, **`spinReverseRegen`** —
  data/spin-features.json's `both_directions`: a held, opposing stick checks the spin, then flips
  and regenerates it
  - Value: `0.6` (stick, 0..1), `1.5` /s, `0.5` kg·m²/s, `25.0` kg·m²/s
  - Used: `moves.ts` `spinTick`
  - Level: L3 — chosen to be reachable and to feel deliberate in this rig's own test
    (`test/spin.test.ts`: a held check takes about 2.3 s against a typical entry), not measured
    against footage of a real reversal
  - Range: none recorded
  - Fixed by: no observable class fits a mid-element direction reversal at all; §11's own list of
    physically-derived constants does not cover this either. Left open rather than claimed L2.

### Ina Bauer

- **`inaBauerScrub`**, **`inaBauerDrag`**, **`inaBauerMinSpeed`**
  - Value: `0.13`, `2.0` × `cdA`, `2.0` m/s
  - Used: `solver.ts` `step`; `moves.ts` `inaBauerStart`
  - Level: L3 (`inaBauerScrub`), L2 (the others)
  - Range: `inaBauerDrag` ≥ 1 (`validate`)
  - Fixed by: `ina_bauer_speed_loss_ms`, at two entry speeds to separate scrub from drag
  - Source: calibrated together to −1.1 m/s over 6 m at 6 m/s, `data/motion-primitives.json`

- **`INA_BAUER_STRIDE`** — hard-coded in `solver.ts`: `0.3` m between the blades along the travel
  - Level: L2
  - Fixed by: footage. It affects tracings only.

---

## 9 · Classification thresholds

These are not physics. They define which edge, depth and call a physical state is **named**, so they
reach `rotation_call` and edge calls, but no two-sided physical observable.

- **`flatThreshold`**, **`flatHysteresis`** — `0.070` rad (4°), `0.026` rad (1.5°).
  `classify.ts` `classifyEdgeSide`, `classifyDepth`; `moves.ts`; `solver.ts`. L2. Fixed by:
  protocol `!` and `e` calls paired with footage.
- **`depthShallow`**, **`depthDeep`** — `0.21` rad (12°), `0.44` rad (25°). `classify.ts`
  `classifyDepth`; `jump.ts` `outsideness`. L2. Fixed by: no external call uses depth.
- **`minDwell`** — `0.12` s before an edge counts as established. `solver.ts` `step`. L2.
- **`dirSpeedEps`** — `0.15` m/s dead band for forward and backward. `classify.ts`, `jump.ts`,
  `solver.ts`. L2.
- **`carveDemand`** — `0.5`, the demand-to-capacity ratio above which a held edge is reported as a
  Carve. `solver.ts` `step`. L2.
- **`callEdgeUnclear`**, **`callEdgeWrong`** — `0.25`, `0.55` takeoff-edge error for `!` and `e`.
  `jump.ts` `edgeCall`. L2. Transcribed from `data/calls-and-deductions.csv`, but the scale they sit
  on is the project's own definition (`edgeMismatch`: 0 on the wanted edge, 0.5 flat, 1 on the other),
  and the ISU publishes no numeric counterpart. So unlike the rotation thresholds they are not
  rule-derived. Fixed by: protocol edge calls paired with footage of the takeoff edge.

---

## 10 · Guards and numerical limits

These keep the solver finite. They are not claims about skating and are not moved to fix a case. They
are listed so none is mistaken for physics. If one ever changes an observable, that is a finding.

- `minSpeedForCurv` `0.5` m/s — guards κ = a / v² near a standstill (`solver.ts` §2)
- Leg length clamp `0.3` m to `1.05` × `comHeight` (`solver.ts` §1, §7)
- Minimum yaw radius `0.35` m (`solver.ts` §3)
- Lean clamp ±`1.55` rad (`solver.ts` §7)
- Tilt command decay `0.3` s while down (`solver.ts` §2)
- Brake minimum speed `0.2` m/s (`solver.ts` §3)
- Two-footed weight band `0.05`–`0.95` (`jump.ts` `land`); lead-foot lean dead band `0.02` rad
  (`moves.ts`); turn foot threshold `0.25` and `0.75` (`moves.ts`)
- Twizzle and Ina Bauer end below half their minimum speed (`moves.ts`, `solver.ts`)
- `SIM_HZ` `120` — the tick rate, a numerical choice fixed by the replay contract

---

## 11 · Not open: physical or rule-derived

These are not tuned, and are not moved to fix a case. A change needs a physical or rules source.

- **`gravity`** — `9.81` m/s². **L0.** Local g varies from about 9.78 to 9.83 m/s² with latitude and
  altitude, which is below any band in the gate.
- **`airDensity`** — `1.29` kg/m³. **L0** for dry air at 0 °C and sea level (ideal gas). **L1** as the
  value for rink air, which is usually warmer than the ice and may be above sea level, both of which
  lower it. The IIHF guideline air temperature of 9–11 °C, as quoted by Hutchins et al. 2026, gives about
  1.24–1.25 kg/m³ at sea level, so the current value probably overstates indoor drag by about 3%
  ([ice-literature §7](ice-literature.md#7--what-this-means-for-ice-labs-constants)). Not changed: it
  moves solver arithmetic and the replay contract, and it gets its own commit. Range: 1.0–1.3 kg/m³, covering 0–20 °C from sea level to about 2000 m (L0). A case at a
  known venue may record its own value **as an input**. That is the one constant a case may set,
  because it is a property of the room, not of the model.
- **`callQuarter`**, **`callUnder`**, **`callDowngrade`** — `0.125`, `0.25`, `0.5` rev.
  **L1.** Transcribed from `data/calls-and-deductions.csv`, which is pending verification against
  current ISU publications. They move only when the data file does.

The `airDensity` exception is recorded in
[gate §3](fidelity-gate.md#3--the-configuration-under-test), and the case schema (Task 1.2) carries it.

---

## 12 · Outside the gate

These are inert under the gate's configuration or reach no §4 observable. They are listed by name so
their absence above is deliberate.

- **Skater stats**, `profile.ts` `STAT_EFFECTS`. Cases hold every stat at the neutral 50, which bakes
  to the preset bit for bit. Spans at 0 and 100: `strokePower` 0.70–1.30, `jumpImpulse` 0.82–1.18,
  `inertiaPullRate` 0.80–1.20, `angulationLimit` 0.75–1.35, `controlLatency` 1.40–0.60, `balanceKd`
  0.80–1.30, `internalGain` 0.80–1.25, `staminaWindTimeDrain` 1.5–0.5, `staminaLegsPerPush` 1.5–0.5.
  Also the curve shape (t<sup>0.75</sup> above 50).
- **Blade wear**, `profile.ts`: `SHARPNESS_FRESH` 1.05, `SHARPNESS_DULL` 0.80, `BLADE_LIFE_HOURS` 20.
  The reference wear bakes to `sharpness` 1.0.
- **Career**, `profile.ts`: `XP_BASE` 10, `XP_QUAD` 0.04, `XP_PER_LEVEL` 25, level weights, tier floors
  40, 55, 70 and 85, and the three sample profiles.
- **Judging**, `score.ts`: GOE quality weights 0.6 and 0.4, judge strictness 0.5 + 0.5u, noise 0.5.
  GOE is not a gate observable.
- **Session metrics**, `session.ts`: `MOVING` 0.5 m/s, `MAX_LANDINGS` 100.
- **The `assisted` preset**, `params.ts`. It is an assist tier and not the preset under test.

If any of these starts affecting a case — for example, if the gate begins testing a non-reference
skater — it moves up into the sections above.

---

## 13 · Stamina

`sim/solver.ts`'s `staminaMode`, design-bible.md §2.8. All fourteen are inert at `staminaMode` 0 (every
preset), the way section 8's moves levers are at `movesMode` 0. Only one is sourced; the rest are L2/L3,
first-pass-calibrated against the scenarios in `test/stamina.test.ts` rather than measured.

- **`staminaLegsPerPush`** — Legs lost per push, scaled by knee depth
  - Value: `0.011`
  - Used: `solver.ts` §1b, once per push
  - Level: **L1** — taken directly, not authored
  - Range: none recorded
  - Source: `src/reference/SkateSolver.cpp`, `S.LegPool -= 0.011f * Knee` — the only one of the two
    referenced stamina functions (`UpdateStamina`, `StaminaGain`) that survives as an actual number;
    neither function is itself defined in that file

- **`staminaWindTimeDrain`**, **`staminaWindSpeedDrain`** — Wind's continuous drain, flat and per (m/s)²
  - Value: `0.0002` /s, `0.00004` /s per (m/s)²
  - Used: `solver.ts` §12
  - Level: L3
  - Range: none recorded
  - Fixed by: a measured Wind decay curve over a real timed program, at a known pace

- **`staminaWindRecover`** — Wind recovered per second, genuinely low-effort only
  - Value: `0.0006` /s
  - Used: `solver.ts` §12
  - Level: L3. Deliberately several times the time-drain above it (`validate`: it must exceed
    `staminaWindTimeDrain`), so recovery reads as "slow", not as a pause button.
  - Range: must exceed `staminaWindTimeDrain` (`validate`)

- **`staminaLowEffortTilt`** — |tiltCmd| at or below which the skater counts as low-effort
  - Value: `0.10` rad
  - Used: `solver.ts` §12, gating both pools' recovery
  - Level: L3
  - Range: none recorded

- **`staminaLegsPerDeepEdge`** — Legs drain per radian |tiltCmd| runs past `depthShallow`
  - Value: `0.015` /s per rad
  - Used: `solver.ts` §12
  - Level: L3. Ordinary cruising (at or under `depthShallow`) is free; only the genuinely deep part of
    an edge costs anything.
  - Range: none recorded

- **`staminaLegsPerJump`** — Legs lost on one takeoff, flat
  - Value: `0.05`
  - Used: `solver.ts` §10, on the ground-to-air transition
  - Level: L3
  - Range: none recorded

- **`staminaLegsPerSitSpin`** — Legs drain per second, spinning with the knee past `spinSitKnee`
  - Value: `0.03` /s
  - Used: `solver.ts` §1c
  - Level: L3
  - Range: none recorded

- **`staminaLegsRecover`**, **`staminaLegsRecoverWindFloor`** — Legs recovered per second while
  low-effort, and the Wind share required before any of it applies at all
  - Value: `0.0008` /s, `0.3`
  - Used: `solver.ts` §12
  - Level: L3. The floor is the bible's own "gated by Wind — once Wind is low, Legs stop coming back",
    made a number.
  - Range: floor is `[0, 1]` (`validate`)

- **`staminaJumpImpulseMin`** — `jumpImpulse` multiplier at Legs 0
  - Value: `0.82`
  - Used: `solver.ts`'s `pFatigue`, read by `jump.ts`
  - Level: **L2** — the bible states the span directly ("1.00 → 0.82")
  - Range: `(0, 1]` (`validate`)
  - Source: design-bible.md §2.8

- **`staminaInertiaFloorMax`** — the loosest `inertiaTucked` can be forced to by Legs 0
  - Value: `1.55` kg·m²
  - Used: `solver.ts`'s `pFatigue`, read by `jump.ts` and `moves.ts`'s spin
  - Level: **L2** — the bible states the span directly ("0.95 → 1.55")
  - Range: at least `inertiaTucked` itself (`validate`)
  - Source: design-bible.md §2.8

- **`staminaMaxLeanLoss`** — radians subtracted from `maxLean` and `maxTilt` at Legs 0
  - Value: `0.1396` rad (8°)
  - Used: `solver.ts`'s `pFatigue`
  - Level: **L2** — the bible states it directly ("maximum sustainable lean −8°")
  - Range: `[0, maxLean]` (`validate`)
  - Source: design-bible.md §2.8

- **`staminaBalanceNoiseBase`**, **`staminaBalanceNoiseMax`** — baseline balance-loop noise amplitude,
  and its multiplier at Legs 0
  - Value: `0.15` m/s², `2.4`×
  - Used: `solver.ts` §2, added to `aCmd`, seeded from `s.tick` alone (`rng`) so a replay reproduces the
    same wobble on the same tick
  - Level: base is L3 (chosen to be perceptible without dominating the command); the multiplier is
    **L2** — the bible states it directly ("×1.0 → ×2.4")
  - Range: multiplier at least 1 (`validate`): fatigue cannot reduce noise
  - Source (multiplier only): design-bible.md §2.8

---

## 14 · Hype

`sim/solver.ts`'s `hypeMode`. Not in the design bible under this name — the operator's own bridge
between the musical and career layers, quoted in full in `README.md`'s own section. All nine are L3,
first-pass-calibrated against `test/hype.test.ts` rather than measured or bible-sourced; inert at
`hypeMode` 0, every preset.

- **`hypeLandingGain`** — hype added per clean landing, scaled by `landingQuality`
  - Value: `0.12`
  - Used: `solver.ts`'s `landingAndTurnCredit`
  - Range: `>= 0` (`validate`)

- **`hypeStreakBonus`** — extra share of that gain per consecutive clean landing already in the streak
  - Value: `0.15`
  - Used: `solver.ts`'s `landingAndTurnCredit`
  - Range: `>= 0` (`validate`)

- **`hypeMusicBonus`** — flat bonus when the same landing also earned a `musicMode` accent
  - Value: `0.05`
  - Used: `solver.ts`'s `landingAndTurnCredit`
  - Range: `>= 0` (`validate`)
  - Fixed by: nothing yet ties this specific number to anything measurable; it is a design choice about
    how much reading the music engine's credit should matter next to the landing itself.

- **`hypeDecayPerSecond`** — hype lost per second, always, so a banked meter is not permanent
  - Value: `0.03` /s
  - Used: `solver.ts`'s `landingAndTurnCredit`
  - Range: `>= 0` (`validate`)

- **`hypeFallLoss`** — share of banked hype a fall costs, proportional, on top of resetting the streak
  - Value: `0.5`
  - Used: `solver.ts`'s `landingAndTurnCredit`
  - Range: `[0, 1]` (`validate`)

- **`hypeControlLatencyMin`** — `controlLatency` multiplier at hype 1
  - Value: `0.7`
  - Used: `solver.ts`'s `pEff`, layered on `pFatigue`
  - Range: `(0, 1]` (`validate`): cannot lengthen the lag

- **`hypeInternalMaxGain`** — `internalMax` multiplier at hype 1
  - Value: `1.3`
  - Used: `solver.ts`'s `pEff`
  - Range: `>= 1` (`validate`): cannot reduce recovery authority below its own base

- **`hypeAngulationGain`** — `angulationLimit` multiplier at hype 1
  - Value: `1.15`
  - Used: `solver.ts`'s `pEff`
  - Range: `>= 1` (`validate`): cannot reduce angulation below its own base

Fixed by, for the whole group: nothing yet. This is a fresh mechanic with no reference implementation
and no motion-capture or footage case to anchor it — the numbers above are chosen to be perceptible in
`test/hype.test.ts`'s own scenarios, not measured against anything external.

---

## 15 · Flow

`sim/solver.ts`'s `flowMode`, design-bible.md §2.6. Only part of the bible's own rises-with/falls-with
table is modelled — see `README.md`'s own section for which two bullets ("alternating lobes" and
"repeated lobes in the same direction" are one signal, still not modelled) are not. All ten are L3
except where noted; inert at `flowMode` 0, every preset.

- **`flowCarveGain`** — flow gained per second on a real, unskidded, held edge while moving
  - Value: `0.35` /s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)

- **`flowFlatLoss`** — flow lost per second on a flat blade while moving
  - Value: `0.25` /s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)

- **`flowSkidLoss`** — flow lost per second while skidding
  - Value: `0.9` /s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)

- **`flowStopLoss`** — flow lost per second under moving speed (0.5 m/s, the same floor `session.ts`'s
  own `MOVING` uses, inlined rather than a lever of its own)
  - Value: `0.4` /s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)

- **`flowBeatGain`** — flat bonus when a turn's cusp or a jump's landing lands within `musicMode`'s own
  accent window
  - Value: `0.05`
  - Used: `solver.ts`'s `landingAndTurnCredit`
  - Range: `>= 0` (`validate`)

- **`flowDamagedIceThreshold`** — local ice condition (`sim/ice.ts`) at or past which it counts as
  "damaged" for flow
  - Value: `0.5`
  - Used: `solver.ts` §14
  - Range: `[0, 1]` (`validate`)

- **`flowDamagedIceLoss`** — flow lost per second on damaged ice past the threshold above, while
  `iceGridMode` is also on
  - Value: `0.2` /s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)

- **`flowDeadAirTime`** — seconds after an element (a turn/twizzle/spin/Ina Bauer or a jump) finishes
  before "dead air between elements" starts costing anything
  - Value: `1.5` s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)
  - Notes: gated on `moveDone.tick`/`landed.tick` both starting at -1, so an opening glide before the
    first element ever finishes is never dead air — see `test/flow.test.ts`

- **`flowDeadAirLoss`** — flow lost per second past `flowDeadAirTime` with no new element under way
  - Value: `0.15` /s
  - Used: `solver.ts` §14
  - Range: `>= 0` (`validate`)

- **`flowStaminaEfficiencyMin`** — Wind drain multiplier at flow 1
  - Value: `0.6`
  - Used: `solver.ts` §12 (stamina's own section), while both `flowMode` and `staminaMode` are on
  - Level: **L2** — the bible states the direction directly ("cheaper to skate well"), though not a number
  - Range: `(0, 1]` (`validate`)
  - Source (direction only): design-bible.md §2.6

Fixed by, for the whole group: nothing yet, the same as hype — a fresh mechanic with no reference
implementation or footage case behind its specific numbers, only the bible's own qualitative table.
