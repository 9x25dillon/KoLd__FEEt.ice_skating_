# The fidelity gate

**Does the blade–ice model reproduce real skating, within tolerances stated in advance?**

This document specifies that question precisely enough to be checked by a program. It defines what
is compared ([§4](#4--observables)), how close is close enough and why
([§5](#5--tolerance-bands)), when the gate as a whole is met ([§6](#6--pass-condition)), and what a
failure obligates ([§7](#7--what-a-failure-obligates)). The implementation is
`tools/ice-lab/validate.mjs`, run against the case corpus in `data/validation/cases/`, and it
writes `docs/fidelity-report.md`. None of those exist yet. This document comes first because the
validator implements it, not the other way round.

> **Nothing in the model has passed this gate.** Every number in Ice Lab has been measured and
> tested against this project's own documents and data. That shows the model is internally
> consistent. It does not show the model is correct, and this gate is where the difference is
> settled.

---

## 1 · What the gate is, and what it is not

The gate asks whether **a skater, a coach or a technical specialist would recognise the model's
skating as correct**, and turns that into measurable claims: lean against speed and radius, the
radius an edge leaves, what a held edge costs in speed, air time and rotation, and how far a body
can pull in.

It does **not** ask whether the skating is fun, whether the controls feel good, or whether the game
is worth building. Those belong to the studio plan's month-four kill gate in
[pre-production-plan.md](pre-production-plan.md), which stays in place for that scenario. Fidelity
comes first because it is the one question that can be answered by one person, offline, for nothing,
and because a model that is wrong about the ice cannot be saved by being fun.

It also does not validate animation, scoring beyond the rotation call, spin and step levels, or
anything the solver does not yet model. Those are reported as **unmodelled**
([§6.1](#61--case-verdicts)): visible, but never counted as passes.

---

## 2 · Evidence

### 2.1 · Confidence levels

Every physical constant, tolerance and modelling claim in this document, in
`docs/open-constants.md` and in the case corpus carries one of four levels.

| Level | Meaning |
| --- | --- |
| **L0** | Established. Sourced from published physics or biomechanics, or a direct consequence of Newtonian mechanics. |
| **L1** | A reasonable extrapolation from L0 material. |
| **L2** | An experimental hypothesis, to be tested against the case corpus. |
| **L3** | Speculative, exploratory only. |

A level is never raised without evidence, and never in the same commit that changes the model. A
number with no source is L2 and goes into `docs/open-constants.md`. It is never given invented
provenance.

### 2.2 · Source types

A case in the corpus has exactly one source type.

| Type | What it is | What it can establish |
| --- | --- | --- |
| **literature** | A published measurement, cited well enough for someone else to find the table or figure | A value with the spread the paper reports |
| **protocol** | An ISU judges' protocol for a sanctioned competition | A categorical call — `q`, `<`, `<<`, `e` — on a specific element |
| **footage** | Broadcast or rink video, with a timestamp and the measurement method written out | A value with the uncertainty of that method |
| **derived** | Computed from an L0 physical relation | That the solver obeys the relation it claims to implement |

**Derived cases check the implementation, not the model.** A derived case can find a sign error, an
integration error at 120 Hz, or a regression. It cannot show that the model matches reality, because
it only compares the solver with the equations it was written from. Derived cases are part of the
corpus and must pass, but they never count toward coverage ([§6.3](#63--the-gate-is-met)).

### 2.3 · What is not evidence

- **The project's own data.** `data/motion-primitives.json`, `data/entry-templates.json` and
  `data/spin-positions.json` were written as design data, not measured. Ice Lab constants calibrated
  against them (`muTurn`, `twizzleScrub`, `inaBauerScrub`, `backPushScale` and others) are
  internally consistent, not validated.
- **The design bible, the engineering package and `src/reference/`.** These are specifications. When
  they disagree with a measurement, the measurement wins.
- **Play sessions.** Session cards and replay clips measure how people use the instrument, not whether
  its physics is right.
- **A case used to set a constant.** Such a case is marked `calibration` ([§7.2](#72--permitted-moves))
  and never counts as evidence for the constant it set.

---

## 3 · The configuration under test

**One parameter set, the one the public build boots.** Today that is `responsive`
(`BOOT_PRESET` in `tools/ice-lab/app/lab.ts`). An outside reviewer is shown that preset, so that is
the one the gate makes claims about. The validator also runs `spec` and reports its results, but
does not gate on them. The two presets share every constant that governs the observables in §4:
blade, ice, bite, jump and inertia. They differ in balance gains, angulation limit, latency and
recovery authority, which change transient behaviour and the reachable carve envelope.

**A case can set only what a real skater or rink would bring.**

- **The skater's body:** mass and height, through the profile layer (`sim/profile.ts`).
- **The initial state:** speed and lean.
- **The inputs:** an input script, preferably a replay clip in the `edgework-replay/1` format, so that
  the replay machinery in `sim/replay.ts` runs the case.
- **The mode switches:** `jumpMode` and `movesMode`, since an element cannot be skated with them off.

A case **may not override any tuned constant.** A case that sets its own bite coefficient can be made
to pass anything. If a case genuinely needs different ice, such as an outdoor rink or a known hardness,
that is a constant of the model, and it belongs in `docs/open-constants.md` with a measurement plan,
not in one case file.

**Determinism.** A case run twice gives the same bytes. When an input script was recorded under an
earlier replay contract, the validator reports the first tick where the current solver diverges from
the recorded digests, using the existing first-divergence check. Divergence is information, not a
failure: after a legitimate model change, a clip is expected to diverge. The verdict comes from the
observable.

---

## 4 · Observables

**An observable is extracted from what a camera could see.** That means positions, orientations,
times and angles. It never comes from internal solver quantities such as `leanEq`, `rGeo`,
`biteCapacity` or `latSlipAccel`. Comparing the solver's internal variables with its own equations is
what derived cases are for. Comparing with reality has to go through the same measurements that
reality supports.

### 4.1 · Notation

| Symbol | Meaning | Solver source |
| --- | --- | --- |
| φ | body lean: the angle from vertical of the line from blade contact to centre of mass | `state.lean` |
| θ | blade tilt from vertical | `blade[i].tilt`, internal, not camera-visible in general |
| v | centre-of-mass speed | `state.vel` |
| r<sub>c</sub> | radius of the centre-of-mass path | fitted to `state.pos` over a window |
| r<sub>b</sub> | radius of the blade tracing | fitted to `blade[i].contact` over a window |
| L | contact-to-centre-of-mass distance | `state.legLength` |
| ρ | effective rocker radius at the contact point | `effectiveRocker()`, internal |
| g | 9.81 m/s² | `params.gravity`, **L0** |

### 4.2 · How the solver relates these, read from the code

These are statements about the current code in `tools/ice-lab/sim/`. They are recorded here so that
a failure can be traced to a specific structure ([§7.3](#73--structural-failures-falsify)).

- **S1 — the lean pendulum.** The body is an inverted pendulum of length L whose balance lean is
  tan φ<sub>eq</sub> = a<sub>lat</sub> / g (`equilibriumLean`, `solver.ts` section 7). **L0** for a point
  mass on a massless leg. Ignoring the body's own rotational inertia about its lean axis is **L1**.
- **S2 — the rigid rocker.** The edge traces R = ρ / |sin θ| (`carveRadius`). **L1** as geometry, for a
  rigid circular blade touching a flat surface. It ignores blade penetration, the hollow, and
  deformation of the ice under load, and whether those matter is **L2**.
- **S3 — which path the rocker sets.** The solver applies R to the **centre of mass**: lateral force is
  m v² / R, and `state.pos` travels on it. The blade contacts are then placed outward by L sin φ, so
  r<sub>b</sub> = r<sub>c</sub> + L sin φ. The lean relation in the camera-visible quantities,
  tan φ = v² / (g r<sub>c</sub>), therefore holds by construction. The **rigid-rocker geometry,
  however, belongs to the blade**, not the centre of mass. At r<sub>c</sub> = 3 m and φ ≈ 28°, the
  two radii differ by about 0.45 m, roughly 15%. That affects the blade tilt the solver computes, and
  with it the edge-depth classification, angulation and skid onset. This is **L2** and is the first
  structural question the carve and tracing classes can answer.
- **S4 — the longitudinal loss.** μ(θ) N + ½ ρ<sub>air</sub> C<sub>d</sub>A v², where
  μ(θ) = μ<sub>glide</sub>(1 + k(1 − cos θ)), plus μ<sub>skid</sub> while skidding (`muLong`, drag).
  The drag term's form is **L0**. The friction form, and its dependence on tilt, are **L2**.
- **S5 — the bite law.** F<sub>bite</sub> = N (c<sub>0</sub> + c<sub>1</sub> sin|θ|) · sharpness · hardness
  (`biteCapacity`). **L3**. The code's own comment calls it a caricature of an interlock.
- **S6 — flight.** Vertical velocity, air time and angular momentum are fixed at takeoff. In the air
  ω = L<sub>ang</sub> / I, and I moves between `inertiaOpen` and `inertiaTucked` (`jump.ts`). Ballistic
  flight and conservation of angular momentum are **L0**. Treating the arms as the only lever in the air
  is **L0** in the sense that no external torque acts. The two-value inertia model is **L2**.
- **S7 — the turn scrape.** The speed a turn costs is μ<sub>turn</sub> g |sin α| integrated over the
  pivot (`moves.ts`). **L3**, calibrated only to project data.

### 4.3 · The observable classes

Each case names exactly one observable. There are six classes.

#### O1 · Carve relation

| Observable | Definition | Real measurement | Model status |
| --- | --- | --- | --- |
| `carve_lean_deg` | mean φ over a steady window ([§4.4](#44--steady-windows)) | body line from blade to hip–shoulder midpoint, on footage filmed perpendicular to the travel | modelled |
| `carve_lean_residual_deg` | φ − atan(v² / (g r<sub>c</sub>)) over the window | — derived only | modelled |
| `carve_held` | whether the edge holds (no skid event) at a given v and r<sub>c</sub> | footage of a clean held edge with no scrape and no spray, at a measured v and r | modelled |
| `angulation_deg` | θ − φ | close footage of boot angle against body line | partial, **L3** measurement |

`carve_held` is **one-sided**. A real skater who holds r at v shows that an edge can. The model has
to be able to do the same, and the case does not ask it to fail anywhere. This is the main way
footage tests S3 and S5 without measuring θ.

**Measurement trap.** On footage, a tracing gives r<sub>b</sub>. Using it in
tan φ = v² / (g r) overstates the radius and understates the lean. Case files state which radius
they measured, and convert with r<sub>c</sub> = r<sub>b</sub> − L sin φ, which is **L0** geometry.

#### O2 · Tracing curvature

| Observable | Definition | Real measurement | Model status |
| --- | --- | --- | --- |
| `trace_radius_m` | circle fit to `blade[support].contact` over a steady window | overhead or high-angle footage, rectified against known rink markings | modelled |
| `trace_lobe_radius_m` | radius of a named figure lobe from an input script | the same, on figure tracings | modelled, figure-eight only |

#### O3 · Edge transition geometry

| Observable | Definition | Real measurement | Model status |
| --- | --- | --- | --- |
| `turn_entry_angle_deg`, `turn_exit_angle_deg` | the tracing tangent's angle to the line through the cusp, 0.5 m either side | tracing footage, or the ice itself photographed after the turn | three-turn, mohawk: modelled |
| `turn_speed_loss_ms` | v before minus v after, at 0.5 s either side of the cusp | footage timing | three-turn, mohawk: modelled |
| — | rocker, counter, bracket, choctaw | — | **unmodelled** |

#### O4 · Speed decay

| Observable | Definition | Real measurement | Model status |
| --- | --- | --- | --- |
| `glide_decel_ms2` | −dv/dt on a held edge, no push, over a steady window | glide test: timing gates or footage over marked distances | modelled |
| `glide_loss_per_m` | −dv/dx over the same window | the same | modelled |

The ice state is recorded with the case wherever it is known: indoor or outdoor, temperature,
time since resurfacing. Friction depends on it, and the model's single `iceHardness` cannot yet
represent it ([§5](#5--tolerance-bands)).

#### O5 · Jump rotation accounting

| Observable | Definition | Real measurement | Model status |
| --- | --- | --- | --- |
| `air_time_s` | `JumpResult.airTime` cross-checked against the takeoff and landing ticks | frame count from last blade contact to first blade contact | modelled |
| `air_time_height_residual_m` | measured height − g t² / 8 | — derived only | modelled |
| `revolutions_turned` | `JumpResult.turned` | blade or hip orientation at the takeoff and landing frames | modelled |
| `rotation_call` | `JumpResult.rotationCall` for a given shortfall | a **protocol** call, with footage giving the measured shortfall | modelled |
| `jump_reachable` | whether some input within the model's limits produces the measured air time and revolutions | footage of a clean element | modelled, one-sided |

The model has no **input** for how hard a real skater pushed. So air time and revolutions for a
specific real jump are tested **one-sided**: the model must be able to reach them. Protocol cases
test the call boundaries with no effort variable involved, which makes them the most
information-dense external evidence the corpus can hold.

#### O6 · Moment of inertia

| Observable | Definition | Real measurement | Model status |
| --- | --- | --- | --- |
| `pull_in_ratio` | ω<sub>tucked</sub> / ω<sub>open</sub> at constant angular momentum, in the air or in a centred spin | revolution period from frame counts before and after the pull-in | modelled |
| `spin_rate_rps` | revolutions per second in a named position | frame count over whole revolutions | modelled |

With angular momentum conserved, the ratio of angular velocities equals the inverse ratio of
inertias. That is **L0**, and it is why a camera can measure inertia. In a spin, blade friction
drains angular momentum (`spinDecay`), so the measurement window has to be short relative to the
decay, or the decay has to be corrected for.

### 4.4 · Steady windows

Carve, tracing and glide observables are taken over a **steady window**: at least 1.0 s, beginning
no earlier than 2.0 s after the last input change, with no skid, no push, no fall, and φ varying by
less than 1° peak to peak across the window. These thresholds are **L2**. They are chosen so the balance
controller has settled in both presets, and the validator reports a case whose run never reaches
such a window as a failure, not as a skip.

---

## 5 · Tolerance bands

Two uncertainties are combined, and they are kept separate on purpose.

- **u<sub>m</sub>, measurement uncertainty.** A property of the source, written in the case file. For
  literature, the spread the paper reports. For footage, the resolution of the method. For derived
  cases, the numerical floor of the solver.
- **b, the model band.** A property of the **observable**, set in this document. It is the claim being
  made: that the model is within ±b of reality for that observable.

A case passes when **|actual − expected| ≤ √(u<sub>m</sub>² + b²)**. Root-sum-square assumes the two are
independent, which is **L1**. The case file records u<sub>m</sub> and the combined tolerance, so
anyone can check the arithmetic. **A tolerance may not be widened after a result has been seen**,
except in a commit that changes nothing else and cites a reason in the source ([§7.2](#72--permitted-moves)).

### 5.1 · Model bands

| Observable | b | Level | Justification |
| --- | --- | --- | --- |
| `carve_lean_deg` | ±3° | L2 | About the resolution of a body line measured by eye on broadcast footage. A tighter band could not currently be checked against footage. |
| `carve_lean_residual_deg` | ±0.5° | L2 | Derived only. Set above the expected settling ripple, and to be replaced by the numerical floor the first validator run measures. |
| `angulation_deg` | ±5° | L3 | Boot angle is hard to read, so the band is exploratory. |
| `trace_radius_m`, `trace_lobe_radius_m` | ±10% of expected | L2 | A skater watching their own figure would notice a lobe that is visibly larger or smaller. 10% is a starting claim, not a perception threshold. |
| `turn_entry_angle_deg`, `turn_exit_angle_deg` | ±10° | L2 | A starting claim. Measuring angles from tracings is itself uncertain at this scale. |
| `turn_speed_loss_ms` | ±0.15 m/s | L2 | About a third of the modelled three-turn loss. Tighter than that, the band would be testing the calibration data rather than the ice. |
| `glide_decel_ms2`, `glide_loss_per_m` | ±25% of expected | L2 | Rink friction varies with temperature, resurfacing and blade condition, none of which the model represents separately yet. |
| `air_time_s` | ±0.05 s | L2 | Close to one frame at each end of a 50 fps interval. |
| `air_time_height_residual_m` | ±0.05 m | L1 | Allows for the centre of mass landing lower than it took off, which the ballistic relation does not assume. |
| `revolutions_turned` | ±0.125 rev | L1 | The smallest rotation boundary in `data/calls-and-deductions.csv`. A larger error could change the call. That file is itself pending verification against current ISU publications ([`data/README.md`](../data/README.md)). |
| `rotation_call` | exact | L1 | Categorical. See [§5.2](#52--categorical-and-one-sided-cases). |
| `pull_in_ratio` | ±15% of expected | L2 | Arms and free leg are not a two-value inertia, so the claim is about range, not trajectory. |
| `spin_rate_rps` | ±15% of expected | L2 | The same. |
| `carve_held`, `jump_reachable` | — | — | One-sided. See [§5.2](#52--categorical-and-one-sided-cases). |

All of these are hypotheses. A band tightens only when cases show the model consistently within a
smaller one, and the tighter band then gets its own justification in this table.

### 5.2 · Categorical and one-sided cases

**Calls.** The validator derives the sim's call from the measured shortfall using the data file's
boundaries, then compares it with the protocol. If the shortfall, including its u<sub>m</sub>, straddles a
boundary, **either neighbouring call passes**. A protocol call cannot be more precise than the
footage measurement it is paired with.

**One-sided.** `carve_held` and `jump_reachable` pass when the model can do what the skater did, with
u<sub>m</sub> applied in the skater's favour. They fail when no input within the model's limits achieves
it. The case supplies the input script that attempts it, so a failing case is reproducible by
anyone.

---

## 6 · Pass condition

### 6.1 · Case verdicts

| Verdict | Meaning | Counts |
| --- | --- | --- |
| **pass** | Within tolerance | Toward coverage, if external and not calibration |
| **fail** | Outside tolerance, or no steady window, or the run could not produce the observable | Against the gate |
| **unsourced** | `expected` is null: a stub waiting for a measurement | Reported separately. Never passes, never fails. |
| **unmodelled** | The case needs an element or regime the solver does not implement | Reported separately. Never passes, never fails. |

An invented expected value is a defect in the corpus. A null expected value is correct.

### 6.2 · No regression

**The validator exits 0 only if every sourced case passes.** Unsourced and unmodelled cases never
affect the exit code. This is what CI enforces on every push, the same way a unit test failure
fails the build.

A newly added case that fails is **the gate working**. It lands with the build red. It is then
resolved under [§7](#7--what-a-failure-obligates), never by editing the case until it passes.

### 6.3 · The gate is met

This is the condition the README calls the fidelity gate. It is project policy rather than a physical
claim, so it carries no confidence level. It changes only by a recorded decision in
[open-decisions.md](open-decisions.md).

1. **No failing sourced case**, as in [§6.2](#62--no-regression).
2. **Coverage.** Each of O1, O2, O4, O5 and O6 has **at least three passing external cases** —
   literature, protocol or footage, not derived — drawn from **at least two independent sources**.
   O3 needs the same for the three-turn and the mohawk. Unmodelled turns do not block it.
3. **Clean evidence.** No case counted in item 2 is marked `calibration`.
4. **Reproduced.** CI has produced the report from a clean checkout, and it is byte-identical to the
   committed `docs/fidelity-report.md`.

Until all four hold, the report states **gate not met**. It also states which items are missing.

---

## 7 · What a failure obligates

A failing case means one of three things: the measurement is wrong, a constant is wrong, or a
structure is wrong. The order matters. Look at them in that order, and never skip to the easiest.

### 7.1 · First, the measurement

Recheck the case: the source, the method, u<sub>m</sub>, the radius convention (O1), the ice state
(O4), and the frame rate (O5, O6). A corrected case is committed **on its own**, with the reason,
before anything in the model moves. If the case survives that, it is a finding about the model.

### 7.2 · Permitted moves

Only constants listed in `docs/open-constants.md` at **L2 or L3** may move, and only under all of the
following conditions.

- **One global value.** No per-case, per-skater or per-element override.
- **Within its stated plausible range.** Every open constant records one. A value outside that range
  is not a tuning, it is a structural failure ([§7.3](#73--structural-failures-falsify)).
- **The whole corpus is rerun.** A move that fixes one case and breaks another has fixed nothing.
- **The case that motivated the move becomes `calibration`.** It still has to pass, but it no longer
  counts as evidence. That constant is now validated only by the cases it was not fitted to.
- **One constant per commit**, naming the case, the old and new value, and the report before and after.
- **The replay contract is respected.** A change to solver behaviour bumps `REPLAY_SOLVER` in
  `sim/replay.ts`, following the convention recorded there.

**Never permitted:** moving an L0 constant (g, the drag law), overriding a constant inside a case,
widening a tolerance in the same commit as a model change, or deleting a failing case.

### 7.3 · Structural failures falsify

A failure is **structural** when no values of the permitted constants, within their plausible ranges,
bring every case in its class into band at once. In practice the sign is a residual whose
**shape** is wrong: it grows with v where the model's term cannot, or has the opposite sign at tight
radii from wide ones, or needs different values of one constant for two cases.

A structural failure is **not tuned away**. It obligates:

1. **A finding** in the fidelity report naming the structure (S1–S7 in [§4.2](#42--how-the-solver-relates-these-read-from-the-code))
   and the regime where it fails.
2. **A level change.** The structure's claim is lowered for that regime, for example
   "S3 is L3 below r<sub>c</sub> = 4 m", and this document is updated.
3. **The case stays failing** until the structure is replaced. A replacement is a model change with
   its own replay contract bump, and it is judged by the whole corpus, including the case that exposed
   the problem.

Structures most exposed today, in order:

| Structure | Exposed by | Why |
| --- | --- | --- |
| S5 bite law | `carve_held` at tight radius and high speed | L3 form. Predicts nothing skids below about 8.4 m/s on a deep edge (`skidOnsetSpeed`). |
| S3 rocker on the centre of mass | `carve_held`, `trace_radius_m`, angulation | L2. Off by about 15% at a 3 m radius. |
| S4 friction form | `glide_decel_ms2` across speeds | Constant μ with quadratic drag. Real ice friction may depend on speed. |
| S7 turn scrape | `turn_speed_loss_ms` | L3, calibrated only to project data. |
| S6 two-value inertia | `pull_in_ratio`, `spin_rate_rps` | L2 range. The trajectory between the values is not claimed. |

---

## 8 · Where this goes next

| Artefact | Does | Status |
| --- | --- | --- |
| `docs/open-constants.md` | Every tuned constant: value, use, level, plausible range, the measurement that fixes it | not written |
| `data/validation/README.md` | Case schema, including `role` (validation or calibration), one-sided and categorical comparisons, u<sub>m</sub>, radius convention and ice state | not written |
| `data/validation/cases/` | Derived cases for S1 and S6, and stubs for everything needing measurement | not written |
| `tools/ice-lab/validate.mjs` | Implements §3–§6, zero dependencies, `--json` | not written |
| `docs/fidelity-report.md` | Generated. Per-observable pass state, deviations, unsourced list, gate state against §6.3 | not written |

When an implementation disagrees with this document, one of them is wrong, and the disagreement is
fixed in the open. Neither is quietly edited to match the other.
