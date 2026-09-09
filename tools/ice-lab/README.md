# Ice Lab — a browser tuning rig for edgework

A 120 Hz, deterministic, inertial implementation of the KoLd__FEEt blade–ice
model, with every constant on a slider and the whole thing running in a
browser. It exists so the questions in
[`docs/open-decisions.md`](../../docs/open-decisions.md) and the risk register
in the engineering package get answered in seconds rather than in UE5 compiles.

**It is not the game and it is not an engine.** [D2 is
closed](../../docs/open-decisions.md#d2--engine) — Unreal Engine 5.4+, resolved
2026-09-03 — and nothing here reopens it. This is the Ice Lab from EDGE-019,
built early and built cheap, so that `KoLdSimCore` can be written in C++ as
transcription rather than as discovery.

```sh
node --test test/*.test.ts     # 64 tests, ~0.8 s
node app/build.mjs             # -> build/
node app/serve.mjs             # -> http://localhost:8123/
```

`tsconfig.json` is there for editors and for an optional `tsc --noEmit`; it is
the only thing in the rig that wants anything installed (`typescript` and
`@types/node`). Nothing else does, and the tests and the build do not need it.

**Zero dependencies.** No `npm install`, no `node_modules`, no network. Node 26
strips TypeScript types natively and exposes the same stripper as an API, which
is the entire build step. The cost is that only *erasable* syntax is allowed —
no `enum`, no `namespace`, no constructor parameter properties — and
`test/boundary.test.ts` enforces that rather than letting it fail in a browser.

---

## What it found

The rig paid for itself before it had a UI. Each of these is recorded as a
test, not just as prose, so it fails loudly if someone changes it back.

### 1. The two halves of the engineering package disagree about handedness

One half correctly calls `Up × t` "to the skater's left". The other calls the
identical expression "Right" and derives every edge code from that, including a
test asserting `{right foot, +0.2 rad} → RFO`. The two are mirror images: one
of them names an RFO where the other names an RFI.

This is not cosmetic. A takeoff-edge validator built on the wrong one would
fail every jump in `data/jump-definitions.csv` while looking perfectly
self-consistent. `sim/math.ts` settles it in the direction the geometry gives,
and `test/classify.test.ts` checks the classifier against every row of that CSV
— both the decomposed `takeoff_foot`/`takeoff_edge`/`takeoff_direction` form
and the packed `landing_edge` form.

### 2. The internal balance authority has its sign backwards

The package computes `a_int = clamp(-gain × balanceError, ...)` and feeds it to
a pendulum of the form `leanAccel = (g sin φ − (a_lat + a_int) cos φ) / L`. A
positive balance error — over-leaned, falling inward — needs a **positive**
`a_int` to arrest it. As specified, the arms and free leg push the skater
further over: a balance system that makes every wobble worse.

### 3. The two-blade lateral solve cannot do what its own test asks

The package computes each blade's impulse from the **full body mass** and
applies them Gauss-Seidel, so the first blade in the order absorbs everything
and the second sees no slip left to cancel. Its acceptance criterion "light
blade skids first" cannot pass against it.

Here each blade answers for its own share. That has a consequence worth stating
plainly, because it is a **model fact rather than a bug**: demand on a blade
goes as its share of the mass and capacity goes as its share of the load, so
the share cancels and both blades sit at *identical* demand ratios. If a
lighter blade should let go first, bite capacity has to be sublinear in normal
load. It is not, yet. `test/bite.test.ts` fails the day someone makes it so.

### 4. The specified balance gains cannot enter a deep edge from upright

Holding a 20° edge at 4 m/s is stable. *Getting there from upright* is not.
Entry is an under-supported fall the loop has to arrest, and at the specified
damping it overshoots into a region it cannot recover from.

Instrumenting which clamp binds says exactly what goes wrong, and the two
presets fail for **different reasons**:

| | binding clamp | | |
|---|---|---|---|
| `spec` at 12° | **angulation**, 256 of 317 ticks | the loop asks for 65° of blade and may only have `lean + 20°` | a controller limit |
| `responsive` at 27° | **maxTilt**, 215 of 314 ticks | the blade is as deep as it goes and the curvature still is not enough | a physical limit |

That distinction is the useful part. Below about 5 m/s the entry limit is the
controller and gains move it; above it the limit is blade geometry, and no gain
does anything — at 6 m/s tripling the authority damping is worth 1°, while
sharpening the rocker from 2.05 m to 1.6 m is worth 7°.

Measured, deepest lean reachable from upright:

| | 3 m/s | 4 m/s | 6 m/s |
|---|---|---|---|
| `spec` (Kd 8, angulation 20°, no rate term) | 4° | **11°** | 32° |
| `spec` + the rate term of finding 5, nothing else | 9° | **19°** | 43° |
| `responsive` (Kd 16, angulation 40°, rate term, credited) | 16° | **27°** | 46° |
| `assisted` | 18° | **29°** | 48° |

The second row is the point: **the single missing term in finding 5 is worth
more than the gain changes were**, and it costs nothing in Kp, Kd or angulation.

Two things this measurement is NOT, both found by checking rather than by
assuming:

- **It is not an entry transient.** Slewing the stick command at 360, 180, 90
  or 45 °/s instead of stepping it changes the limit by nothing at all.
- **It is partly the measurement horizon.** The run is six seconds with no
  propulsion, so speed decays and the holdable lean decays with it. With losses
  off, `spec` reaches 13° at 4 m/s rather than 11° and `responsive` 29° rather
  than 27°; at twenty seconds *every* parameter set collapses to 4–7° for no
  reason except that the skater has run out of speed. Any measurement of the
  balance loop must either stroke or disable losses, and this is the same trap
  as the fifth entry under *Things that will trip you up* in the hand-off, one
  level up: it contaminates a finding rather than an afternoon.

The table also contains the most important thing the model says about the game:
**speed is what buys depth**, and it buys it as *v²*. Once the controller stops
throwing depth away at low speed, `tan φ` tracks the closed form κ = g tan φ /
v² to three digits — 1.777 measured against 1.778 predicted from 3 to 4 m/s.
Deep edges are a reward for having built speed.

### 5. An assist tier that raises internal authority makes balance worse

The obvious way to write an assist is to give the player more recovery
authority. Raising `internalMax` from 1.5 to 2.5 puts the skater down at tick
**77** of the reference sequence instead of tick 617 — and the response is not
even monotonic, since 2.0 lasts *longer* than both. That is the signature of a
proportional gain with no damping rather than of a difficulty knob.

**Fixed**, and it took two changes, not one:

```
a_int = clamp(internalGain * balanceError + internalRateGain * leanRate, ±internalMax)
                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^
```

Arms and a free leg are *swung*, and what they are swung against is lean rate.
The term the package has is the position half of a PD controller with the rate
half missing. `internalRateGain` is 0 in `spec`, so the defect stays measurable,
and `validate()` now rejects any set that raises `internalMax` past 2 without
it — which is the check that stops this being rediscovered inside a UE5 tuning
asset.

With both halves in place the ceiling behaves like the knob it was meant to be:
1.5, 2.5 and 3.0 all skate the reference sequence. It is still not free, and the
cost is honest — a 20° edge takes 2.9 s to settle under `assisted` rather than
1.7 s, because damping is exactly what is being bought.

`internalMax` is also not unbounded. 2.5 m/s² is about a quarter of *g* from
arms and a free leg, which is already generous; at 5 the skater holds leans no
edge can support and the ice stops mattering.

### 6. A save is scored as a fall

The other half of finding 5, and the sharper half.

`balanceError` is the gap between the body's lean and the lean the **edge
alone** would balance — so a skater using their arms and free leg is
deliberately not at it. That is what the arms are *for*. The balance-timeout
test reads that error and counts none of the authority, so **using the recovery
authority is itself the fall condition**, and the more authority a tier grants,
the sooner it fires.

The tell is where the skater is standing when it does: at `internalMax` 2.5 the
reference sequence is declared over at tick 77, at **2.6° of lean**, upright, at
4 m/s, mid-recovery. Whatever that is, it is not a fall — and it is most of why
the assist tier appeared to make balance worse.

`fallAuthorityCredit` decides how much of the internal authority counts as
support in that test. It is 0 in `spec`, which reproduces the package bit for
bit; the presets set it to 1. Two things worth knowing about it:

- It buys **no** depth: the entry envelope with credit alone is 4 / 11 / 32°,
  identical to `spec`. It is not a gain, it is a correction to a detector, and
  `test/balance.test.ts` asserts the two are never conflated.
- It does not make the skater unfallable. A lean the edge cannot hold still
  goes down, by `LEAN EXCEEDED` — the honest reason — even at full assist.

### 7. Smaller things the model needed and the package does not have

- **The effective rocker varies along the blade.** The front third is far
  tighter, which is why turns are executed "on the rocker" — the contact point
  is a second steering channel independent of lean. The design bible and
  `src/reference/SkateSolver.cpp` both carry this; the package uses one
  constant radius and quietly removes a whole technique.
- **A flat blade is not a caster.** Skipping the lateral solve when off an edge
  leaves stroke impulses in the velocity with nothing to remove them, and
  straight stroking crabs sideways — measured at just under a metre of drift
  over fourteen metres before it was fixed. `biteC0` is exactly the coefficient
  that stops this.
- **A knee is not a step function.** Slamming the knee from straight to deep
  asks the leg spring for more than g of downward acceleration, the normal load
  goes to zero, and the solver reports a skater who has jumped. The knee
  command is rate-limited.
- **An ideal edge does no work.** Projecting the lateral component out of the
  velocity, as the package does, bleeds `cos(ω dt)` of speed every tick — about
  1% per second at 4 m/s and 20°, scaling with the timestep. Rotating the
  velocity instead conserves speed *exactly*, which `test/carve.test.ts` asserts
  to 1e-9. Left in, that artifact gets tuned around as though it were drag.

---

## Layout

```
sim/math.ts        vectors, deterministic wrappers, mulberry32, CRC32
sim/types.ts       the vocabulary; the packed edge code and its "RFO" spelling
sim/params.ts      every tunable, their sources, validation, and the presets
sim/blade.ts       effective rocker, carve radius, bite capacity, skid onset
sim/solver.ts      one skater, one fixed tick, a pure function
sim/classify.ts    continuous blade state -> the discrete edge vocabulary
sim/telemetry.ts   fixed ring, CSV export, event log
app/pad.ts         controller and keyboard, one intent shape
app/loop.ts        the 120 Hz accumulator and its dt clamp
app/draw.ts        blades, carve circles, force vectors, tracings, HUD
app/panel.ts       the sliders
app/lab.ts         wiring
app/build.mjs      TypeScript -> browser JS, no dependencies
app/serve.mjs      static server that will not cache
```

`sim/` never imports `app/`, never touches the DOM, a clock, or `Math.random`,
and declares nothing that type stripping cannot erase. `test/boundary.test.ts`
reads the actual import statements and fails if any of that changes — the
pattern is carried over from SONIC DRIFTER, where it keeps a physics library
from being tuned for playability. Here it enforces what KOLD-007 asks for and
what the UE5 port depends on: `KoLdSimCore` may depend on nothing but `Core`.

## Where the numbers come from

The design bible and `src/reference/SkateSolver.cpp` are the project's own, so
they win wherever the engineering package disagrees:

| | bible / SkateSolver.cpp | package | taken |
|---|---|---|---|
| rocker radius | 2.05 m | 2.2 / 2.4 m | **2.05** |
| μ skid | 0.35 | 0.03 | **0.35** |
| max lean | 1.13 rad (65°) | 1.05 / 0.96 | **1.13** |
| air drag | ρ 1.29, CdA 0.495 | 1.2, 0.45 | **bible** |

The bite model (`c0 + c1 sin|θ|`) has no counterpart in the bible, which says
only that the edge "lets go". Those two constants are the package's, and they
are the first thing this rig exists to tune. Note what `c1` means once it is
above about 1: that is not Coulomb friction, which steel on ice cannot supply.
It is the edge cutting a groove and pushing sideways against the wall of it.

## What is deliberately not here

Airborne flight, spins, turns and three-turns, falls beyond their trigger,
animation, audio, networking, stamina, flow, and the ice grid (tracings are
drawn, but they do not yet feed friction or bite back into the solver as the
bible's §05 requires). The stroke is the design bible's semi-analytic push, not
a leg model.

## Porting it

The whole point. `sim/` is written to be transcribed:

- SI throughout — metres, seconds, kilograms, newtons, radians.
- Plain data, no classes in the hot path, no allocation inside `step`.
- `step(state, input, params, dt, events)` is a pure function.
- Every transcendental goes through `sim/math.ts`, so a bit-exact
  cross-platform library is a substitution rather than an audit.
- The checksum quantizes by truncation, which is exact in IEEE-754 and
  identical on every target; rounding modes are not.
- The edge code's bit layout and its `RFO` spelling are already what
  `data/jump-definitions.csv` uses.

Export a tuned parameter set with **params.json** in the panel; it emits only
what differs from `spec`, which is what a tuning-log entry should contain.
