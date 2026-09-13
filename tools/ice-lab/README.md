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
node --test test/*.test.ts     # 249 tests
node app/build.mjs             # -> build/
node app/serve.mjs             # -> http://localhost:8123/
```

`tsconfig.json` is there for editors and for an optional `tsc --noEmit`; it is
the only thing in the rig that wants anything installed (`typescript` and
`@types/node`). Nothing else does, and the tests and the build do not need it.

**Zero dependencies.** No `npm install`, no `node_modules`, no network. Node 24.19+ or Node 26
strips TypeScript types natively and exposes the same stripper as an API, which
is the entire build step. The cost is that only *erasable* syntax is allowed —
no `enum`, no `namespace`, no constructor parameter properties — and
`test/boundary.test.ts` enforces that rather than letting it fail in a browser.

The separate [UE-REPLAY-01 native foundation](native/README.md) builds C++ math
and serialization checks against the pinned `/5` oracle. It does not yet run
a native solver or Unreal verifier.

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

Measured, deepest lean reachable from upright — *reached*, not merely survived,
because those are different numbers once a skater can hold a lean with their
arms (finding 7):

| | 3 m/s | 4 m/s | 6 m/s |
|---|---|---|---|
| `spec` (Kd 8, angulation 20°, no rate term) | 4° | **11°** | 32° |
| `spec` + the rate term of finding 5, nothing else | 9° | **19°** | 43° |
| `responsive` (Kd 16, angulation 40°, fixed) | 13° | **25°** | 44° |
| `assisted` | 13° | **25°** | 44° |

Each preset survives about 2° deeper than it *tracks* — commanded 27° at 4 m/s,
`responsive` stays up but sits at 25°. Quoting the survival number would have
been the flattering mistake.

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
cost is honest and shows on a stopwatch: a 20° edge settles in 1.8 s under
`assisted` against 1.4 s under `responsive`, because damping is what is being
bought. Since finding 7, the extra authority no longer costs anything — and no
longer buys much either. **An assist tier's real content is latency and
damping**, not authority.

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

### 7. The internal authority has no range limit, and holds a lean forever

Found by building control scheme B, which could not steer and should have been
able to.

A skater commanded to a 20° edge settled at 13°, on a flat blade, going
perfectly straight, indefinitely — held up by the arms and the centre of
pressure while the balance loop steered the other way trying to fall into the
edge it had been asked for. Neither tracking the command nor falling off it,
which reads on screen as a controller that ignores you.

The arithmetic is exact and damning: `internalMax` 1.5 plus the two-footed
centre-of-pressure term is 2.74 m/s², and holding 13° of lean costs
`g·tan(13°)` = 2.26 m/s². Inside budget, so it holds. Forever.

**Arms have finite travel.** You can throw them out to catch a wobble; you
cannot hold them out to hold a lean. So the term is high-passed —
`internalWashout`, a time constant in seconds — and what is held drains away
while what changes still gets through, which puts the load back on the edge
where it belongs. The centre-of-pressure term is deliberately *not* washed out:
a stance 24 cm wide really can hold about 7° indefinitely, and that is what
standing still is.

This defect was invisible until finding 6 was fixed. With the fall test
crediting none of the authority, these states timed out and fell over, so the
model looked honest for the wrong reason. **Fixing one thing is how you find
the next one**, and the entry tables above moved by 1–3° when it landed.

### 8. Smaller things the model needed and the package does not have

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
- **A straight leg cannot push.** A stroke bends the knee to at least the
  neutral stance (0.35, where the keyboard rests) whether or not the trigger
  asked it to, so a pad with RT released strokes at close to keyboard strength
  instead of not moving at all — the push force is `strokePower × knee`, and
  a released trigger used to read as a straight leg. Deeper RT is still a
  stronger push; the floor only sets where zero is, and it applies in every
  scheme alike.
- **An ideal edge does no work.** Projecting the lateral component out of the
  velocity, as the package does, bleeds `cos(ω dt)` of speed every tick — about
  1% per second at 4 m/s and 20°, scaling with the timestep. Rotating the
  velocity instead conserves speed *exactly*, which `test/carve.test.ts` asserts
  to 1e-9. Left in, that artifact gets tuned around as though it were drag.

### 9. Two feet down, the stance pulls against the lean

Found 2026-09-13, fixed the same day. With both feet on the ice the
centre-of-pressure term — the stance shifting pressure between the feet —
is proportional on the balance error and nothing else, and it aims for the lean
the edge alone balances. So it pulls against the lean controller: the
controller eases the edge to let the body lean in, the stance holds the body up
off the edge it has eased, and entering a lean from upright its undamped push
first resists the lean and then drives it past anything the edge can hold. The
blade pins at maxTilt and the skater goes down. One-footed there is no stance
term and none of it happens.

Measured on the old `responsive`, 4 m/s, both feet down, 20° asked for: the
blade pinned for 229 ticks and the skater fell at 3.4 s, where one-footed the
same command settles at 20.1°. At 5 and 6 m/s it stayed up but settled anywhere
from 15° to 22°, and a two-footed slalom fell at 7.1 s.

Two corrections, both 0 in `spec`, both on in the presets:

- **`copRateGain`** — the rate half of the stance's PD, as finding 5 gave the
  arms theirs. Pressure is shifted against a lean that is moving, not only one
  that is off.
- **`copCommandShare`** — the stance aims for the lean the skater commands, as
  far as the edge could carry the stance's load at this speed. At a standstill
  the edge can carry nothing, so the stance aims where it always did and
  standing still is bit-for-bit what it was.

Now every two-footed lean the edge can hold is held: 13, 20 and 25° at 4 to
6 m/s settle within 0.5° with under 0.5° of overshoot, 20° at 4 m/s in 1.30 s
(one-footed 1.63), and the slaloms that fell or overshot 9° track to 0.1°. One
foot is untouched. `test/stance.test.ts` holds all of it against the package's
stance, built by adding to `spec`.

---

## Controls, and the three schemes

Keyboard: **A/D** lean, **W/S** rocker fore-aft, **Shift** knee, **Q/E** weight,
**Space** stroke, **X** brake, **R** reset, **P** pause, **T** preset, **K** sample
skater, **M** pad scheme. Jumps, when on: **J** cycles off / hop / full / full with the
moves, **C** arms out, **F** toe pick. **L** turns the moves on and off by themselves; with
them on, **B** on an edge is a turn, **Z** held a twizzle, **Y** held a spin and **I** held
an Ina Bauer.

Pad: **left stick** lean, **RT** knee, **A** stroke, **LT** brake, **LB/RB**
weight, **Y** reset, **X** preset, **Back** scheme; for jumps, **right stick**
carriage, **B** toe pick, **D-pad ↑** jump mode (and past full jumps, the moves), **D-pad ↓** camera view, **D-pad ← →**
zoom — or, in the jump challenge, the previous / next jump. The courses are on
the stick clicks: **left stick click** next course, **right stick click** next
ghost. With the moves on the face buttons take the bible's §2.1 layout: **B** is the
turn, **X** held a twizzle, **Y** held a spin, **LB + RB** together an Ina Bauer, reset moves to **Back**, and the toe
pick moves to a tap of **LT**, which held is still the brake (the preset and the
scheme stay on keyboard **T** and **M**).
The chase camera's tilt stays on **[ / ]**. A browser hides a gamepad
until a button is pressed, which reads exactly like a broken pad.

**The input panel** (top right, toggle "input") shows the hardware as read —
sticks, triggers, bumpers, buttons lit as they fire — beside the `SkatingInput`
the live scheme turned it into. The gap between the two rows *is* the control
scheme. Its stick captions explain each scheme, so it is forced off under
`?playtest=1`. The skater figure is drawn from state alone: feet on the
solver's own contacts, leg brightness the weight share, torso forward with the
knee, arms swinging with the save and gold when it saturates.

**The camera** (`app/camera.ts`) is a debug camera, not the game's — that is
design-bible §4.5's Broadcast Director, in UE5. **V** / **D-pad ↓** cycles
*north up* (the original view), *travel up* and *chase*; **+ / −**, the wheel or
**D-pad ← →** zoom; **[ / ]** lower and raise the chase camera, 15° to 85°.
Travel up and chase turn with the direction of **travel**, not the body, so in
the air — velocity fixed at takeoff, body spinning — the view holds still, which
is §4.5's never-cut rule for its reason. Chase is orthographic: the ice tilts
away, height lifts by the cosine, and the skater stands up as a figure built on
the solver's pendulum (base at the blade contacts, COM at `pos` and `comZ`, knee
solved from two 0.5 m segments), with the balance lines in 3D beside it. The
camera steps with the simulation, so a replay is framed as it was played, and it
is locked to north up in `?playtest=1`, because the view is part of the stimulus.

**The Figure Eight** (**G**, `app/figure8.ts`) is a game on top of the rig — the
design bible's The Patch in miniature. Skate the outside eight: right forward
outside clockwise round the right circle, then left forward outside round the
left, from the crossing where a reset puts you, at a fixed 5 m/s so every run is
the same task. It scores how far the tracing strays from the figure — the
pre-production plan's figure-eight deviation, RMS metres from the reference
curve (§6) — how much of each lobe you held the edge it asks for, and your pace,
all three shown. Your best run is kept in the browser with its replay, and that
replay skates beside you as a ghost; a solver version bump orphans it rather
than let it skate physics that no longer exist. The circles are 6 m because a
steering bot finishes them from 5 m/s and falls on the second lobe of a 5 m
eight (the test says so); a push at the crossing is part of the figure, since
75 m is too far to glide. It reads the state and never writes it, and like jumps
it is unreachable in `?playtest=1`.

**Ghost races** (`app/race.ts`). The ghost is a replay re-simulated, so its
whole run is known the moment it is picked: it is skated once through the same
tracker, and the panel shows how far ahead or behind you are *at this point of
the figure*, your split at the crossing, and the verdict at the finish. **H**
cycles the ghost — your best, your last finished run, a replay file chosen with
**race a replay**, or none — and restarts. A replay carries its own tuning, so
a ghost recorded under other parameters races them against yours, and the panel
names the parameters that differ: a race between two tunings, which is the
comparison the rig exists for.

**The edge course** (**G** again, `app/edges.ts`) teaches the edge names. A
slalom of eight gates, 14 m apart and 1.5 m either side of the line, each asking
for one named edge — *LFI, left forward inside* — checked against the support
blade as it crosses the gate line: clean, wrong edge (and which one you were
on), or missed. The weave alternates turn direction and each gate's edge turns
its way, so the name tells you the foot and the lean: RFO and LFI turn right,
LFO and RFI turn left, every forward edge twice (a test holds each against the
solver's own classifier). The panel shows the gate ahead in words and the edge
you are on now, green when it matches. Backward edges are not on it — nothing
short of a jump turns the skater round. Best score, ghost and races work as on
the Figure Eight; **G** cycles off, Figure Eight, edge course. The spacing is
14 m because the lean arrives about half a second after it is asked for, and
the blade carves the other way first: a steering bot finishes 12 m and 14 m and
falls on the last gate of 16 m, where the course bleeds speed to 2 m/s.

**The jump challenge** (**G** once more, `app/jumps.ts`) — offered only while
jumps are on (**J** to full), so it is off by default the way jumps are. **1–6**
picks the target — toe loop, Salchow, loop, flip, Lutz, axel — and each attempt
starts the way that jump leaves the ice: backward at 5 m/s, forward for the
axel. The panel gives the takeoff from `data/jump-definitions.csv` in words
("left backward outside, toe pick (F)") and the edge you are on now. The landing
is scored by `sim/score.ts` from the data — base value, rotation and edge calls,
the seeded nine-judge GOE — less the data's fall deduction if it came down, and
goes on a board of six bests under the jump it *was*: mean a Lutz, take off an
inside edge, and the board files a flip and says so. Each jump keeps its best
attempt as a ghost to watch; the board's total is the sum of the six.

**Falling, and getting up.** A fallen skater slides until the tester does
something about it. A fresh press of **A / Space** stands them up where they
fell, facing the way they were facing, at rest — the bible's §3.4 `GetUp`, with
the tester choosing the moment. The session, its trace and its fall count carry
on; the event log records `RECOVERED`. The press is consumed, so it is not also
a stroke, and a button already held when the ice arrived does not count: the
skater who fell mid-stroke with A down is not back up the next tick. **R**
still resets to the start position and speed, and wipes the trace.

**Three schemes, labelled A, B and C**, cycled with **M** or **Back**. The
labels are all a tester ever sees, and all an *observer* sees too, because
[pre-production-plan.md §7](../../docs/pre-production-plan.md) requires it. The
mapping below is the developer's copy and belongs nowhere on screen:

| | what the sticks do | what it trades |
|---|---|---|
| **A · Lean & Load** | left stick is the lean vector, fore/aft on it the rocker; right stick is carriage, which only a jump reads | the bible's §2.1 proposal, and what ships if it wins |
| **B · Steer & Load** | left stick is intended travel direction; the skater picks the edge and the lean; nothing on the pad addresses the blade | keeps the carve physics, gives up deliberate inside/outside edge choice — the sport's alphabet |
| **C · Two-Foot** | left stick is the left blade's edge, right stick the right blade's; fore/aft on either stick is that blade's contact point, and the solver gets their mean | possibly unlearnable, possibly the most distinctive scheme in any sports game |

Three, not one, because the bible's own risk 1 says so: *"no shipped game has
used analog lean plus analog knee as its primary verb … keep two fallback
schemes prototyped rather than one."* **Record which scheme a session ran** —
it belongs in the log next to the parameters, and the session export does it
for you.

Two things B taught, both measured:

- **It must steer on the heading it is about to have**, not the one it has. To
  lean left the blade first tilts right, so yaw *reverses* at the start of every
  turn and any damping term on raw yaw feeds that reversal back: 120° of
  overshoot at every gain in the sweep. With 0.3 s of lead it settles within a
  degree from 45° to 170°.
- **It has to commit to one foot.** Two-footed it settles 12° off the requested
  heading and falls on anything past 90°, because you cannot hold a deep edge
  with both feet down. Turn direction does not choose the foot — a left curve is
  an LFO *or* an RFI — so B keeps whichever foot the player chose and commits to
  it as the edge deepens.

## Who is skating — the profile layer

`sim/profile.ts` is the first piece of the career game, and it changes nothing
about the solver: a `SkaterProfile` is **baked** over a preset by
`applyProfile` into an ordinary `Params`, the way a UE5 tuning asset would be,
and the solver never learns the numbers came from a person. Three kinds of
thing live on a profile, moving at three speeds: the **body** (mass, height),
the **blade** (wear since the last sharpening, which ice time grows and
`sharpen` resets) and five **stats**, 0..100 — strength, spring, edge control,
balance, stamina — which only training moves.

The balance is in one table, `STAT_EFFECTS`, and one curve. Fifty is the
reference skater on every axis and bakes to the preset **bit for bit**, so
nothing recorded so far has moved. The bottom half of a stat buys back a
handicap linearly; the top half buys a bonus with diminishing returns, so the
90th point is worth less than the 60th. The XP price of a point rises
quadratically, so the same curve is paid for on the way up. Strength moves
`strokePower`; spring the jump impulse and the pull-in rate; edge control the
angulation limit and the control latency; balance the lean damping and the
arms' authority. **Stamina moves nothing yet** — the rig has no Wind or Legs
pool (design bible §2.8) — and `test/profile.test.ts` records that emptiness
rather than hiding it. Mass goes straight in and does less than a player will
expect, because stroke, bite and lean all scale with the normal load: what it
moves is drag per kilogram and the jump, where the same leg drive lifts more
kilograms less high.

`overall` is a weighted mean of the five, `tierOf` puts it on the bible's ladder
(club, regionals, nationals, grand prix, worlds), `level` counts XP invested,
and `train` spends XP on one stat without overspending or passing the cap. All
pure, all in `sim/`, so a career state can be replayed and checked like a run.
**K** cycles four sample skaters — reference, a club novice on dull blades, a
nationals senior, a worlds medallist — over whatever preset is loaded, and the
HUD names them. The measured span, `responsive` preset at 4 m/s: a stat-0
skater enters a 21° edge from upright, the reference and a stat-100 skater
both 27° — the top half of edge control and balance buys settling, not depth,
because entry depth at that speed is bounded by the lean loop and not by the
stats (§4 above). Six seconds of stroking from 1 m/s reaches 3.0 / 3.9 / 4.9
m/s at strength 0 / 50 / 100.

## Jumps, scoring, the Edge Ribbon and the edge tone

Added 2026-09-10, **over [pre-production-plan.md §1](../../docs/pre-production-plan.md)**,
which refuses jumps in the prototype so that "an exciting jump cannot rescue a
boring foundation". The operator decided to have them in the rig anyway. They
are contained rather than hidden: `jumpMode` is 0 in every preset, `?playtest=1`
forces it to 0, and mode 1 is exactly the plan's week-9 hop — no rotation, no
element, no call.

**`sim/jump.ts` is `src/reference/JumpResolver.cpp`.** There is no jump button:
hold the knee deep (Shift / RT past 0.7) and release it (below 0.45) — the
release is the takeoff, 0.30 s is the ideal load, and a load held past 1 s was a
carve and is cancelled. Vertical velocity, air time and angular momentum are set
at that instant and never again (`test/jump.test.ts` checks L is constant in
the air and that the arms cannot change the flight). The air has one lever:
carriage held out keeps the body open at 4.0 kg·m², let go it draws in toward
0.95 at 11 kg·m²/s, and ω = L / I. The whip — carriage held at the release —
sets L.

The panel reads the jump off the takeoff: foot, direction, the edge the *setup*
was held on, and whether the toe picked within 90 ms. A lutz that rolls inside
at the last moment is still a lutz, with an `e`. The attempted revolutions are
inferred as the next one above what was cleanly turned (2.8 is a 3 with `q`, 2.4
a 3 with `<<`), because there is no program sheet. Every jump lands RBO; an
under-rotated one comes down crossways, the blade scrubs off the velocity it
does not point along, and it usually goes down as `LANDING`.

Measured on `responsive`, perfect 0.30 s load: v_y 2.94 m/s, 0.44 m, 0.59 s. A
full whip and a tuck off RBO with a pick is a clean **3T** (3.04 rev); half a
whip is a **2Lo<** and a fall. Those are the bible's own numbers doing what they
say.

**`sim/score.ts` is the jump half of `ScoreCalculator.cs`**, reading
`data/scale-of-values.csv` and `data/calls-and-deductions.csv` (fetched beside
the page; the single-file bundle has none and shows no score). Base value with
`<` 80%, `<<` one revolution fewer, `e` 80%; nine seeded judges, trimmed. Where
the reference and the data disagree — the reference caps an `e` at GOE −1, the
data says −3 to −4 mandatory — the data wins. `test/score.test.ts` pins the SOV
against the table the `.cs` inlines, and `rel_difficulty` against the SOV.

**The Edge Ribbon** (bible §4.6) runs up from the bottom of the rink: curvature
is the carve being traced, thickness the lean, a bead the knee, and the side is
coded by shape as well as colour (outside solid, inside dashed, flat dotted,
skid broken). **The edge tone** (bible §5.3) is the plan's crude version: a
noise bed per foot, a partial that sings above 25° and rises with depth, a skid
hiss, and a toe click, takeoff swell and landing "chk" that is dirtier the worse
the landing. Both are in the plan's build list and both stay on in playtest.
Audio starts on the first key or click; a gamepad press is not a gesture.

## The moves — crossovers, turns, twizzles, spins, the Ina Bauer, and jumps from their entries

Added 2026-09-13, on the operator's direction — *"i am seeing skaters doing back
crossovers right into the jump and we need to put that in the games engine for
simulation realism"* — over [pre-production-plan.md §1](../../docs/pre-production-plan.md)
the way jumps were, and contained the way jumps are: `movesMode` is 0 in every
preset, `?playtest=1` forces it to 0, and every lever it gates is inert at 0.
Replayed through `/4` and `/5` with the moves off, the fixture and three of the
operator's play clips — 22,184 ticks — match on every state field and event.

**A push while leaning into a curve is a crossover** (bible §2.1: *"a straight
stroke on a flat, a crossover on a curve"*). The outside foot pushes out on its
inside edge, as a stroke does; the inside foot pushes **under** the body on its
**outside** edge. Both reactions then point at the centre, so the push carries
part of the arc's centripetal force instead of weaving the skater off it — and
since a centripetal force does no work, only the push's forward half is speed.
Whether a push is a crossover is read off the body's lean (`crossoverLean`, 12°),
not the blade's: at 7 m/s a 13 m circle is 9° of blade and 21° of body, and a
blade threshold turned those crossovers back into strokes.

The bible's §2.2 has the feet the wrong way round (*"the outside foot pushes
under, the inside foot pushes out"*); the underpush is the inside foot's, which
is also the only assignment in which both reactions point inward. Corrected in
`sim/solver.ts`, recorded here.

**What it found.** A stroke on a curve had always been broken, and nothing
stroked on a curve until now. During a push the pushing leg carries half the
body but supplies no centripetal force, so the body's lateral support halves,
the equilibrium lean halves with it, and the curve collapses the moment the
skater pushes: measured at 5 m/s on a 20° command, 51% short of what the arc
needs and the lean swinging 19–53°. With the moves on, every push has the
carving blade carry the pushing leg, and a crossover supplies its own share:
within 0.3% of the arc and 20–27° of lean through twenty pushes.
`test/crossover.test.ts` holds both numbers. `spec` keeps the defect, as it
keeps the others.

**Against the data.** `data/motion-primitives.json` has a forward crossover
gaining 1.15 m/s at 6 m/s and a back crossover 1.05. Measured from 5.7 m/s at a
full knee: **+1.01 forward, +0.92 backward** — the bible's push is 12% short of
the data, and backward is `backPushScale` (0.91, the data's own ratio) of forward.
Pushing backward is slightly *weaker*, not stronger; skaters use back crossovers
before jumps because they build speed while already facing the way the takeoff
needs, so no turn has to bleed it off at the last moment. Stroking and
crossovers both top out near 8.7 m/s, where the pushing blade's own edge starts
to skid.

**Turns** (`sim/moves.ts`). **B** on an edge turns the skater round: a
**three-turn** keeps the foot and changes the edge, a **mohawk** changes the foot
and keeps the edge's character, and both rotate into the curve (bible §2.3).
Which it is, is where the weight is at the cusp — still on the pivot foot, a
three-turn; moved to the other (**Q / E**, LB / RB), a mohawk. This is how a
skater gets backward, so it is how most jumps are reached: five of the six take
off backward, and the salchow's entry is *"a forward outside three turn onto the
back inside edge"* (`data/entry-templates.json`).

The model is a pivot. The body keeps the arc it was on; the blade, lifted onto its
rocker, turns half a revolution about its contact, scraping across its own path
(`muTurn g |sin a|`); at the cusp, blade square to the path, the frame the lean is
measured in reverses; at the end the blade is aligned with the path again, the
other way round, and carving resumes on the exit edge. **The cusp is a change of
frame, not of physics**: lean and tilt are measured toward the heading's left, so
reversing the heading negates them with the body unchanged — the same lean
toward the same centre, the same blade depth, the same circle, now on RBI. The
classifier reads the side from the sign of the tilt, so the edge code flips from
outside to inside on the cusp tick, which is exactly what a three-turn does.

Measured on `responsive` from 6.2 m/s: RFO three-turn → RBI costs **0.46 m/s**,
LFI mohawk → RBI **0.42** (data: 0.45 and 0.40 at 6 m/s, which `muTurn` and
`mohawkScrub` are calibrated to). On the front of the rocker (stick forward) the
pivot is quicker and costs **0.26** — turns really are made on the rocker.

**A held stick keeps its circle.** A and C read the stick in the body's frame, so
a turn moves the circle's centre from one side of the skater to the other; read
literally, a thumb still holding right would lean them out of it. The cusp
mirrors a held stick until it comes back toward centre, then the next lean is the
new frame's (`latchTurns` in `app/schemes.ts`). B steers on the ice, which a turn
does not move, and is never mirrored — but B was built for forward skating and
has not been taught to steer backward.

**A turn's rotation carries into a jump.** A jump's release waits for the exit
edge, and takes off with `spinCarry`: `turnCarry` (0.11) of the pivot's rotation
rate, draining over `turnCarryTime` (0.5 s) — so the jump has to come straight
out of the turn. Measured, a salchow at half a whip: from a steady LBI **1.62**
revolutions and a fall; out of a LFO three-turn, **1.93** and a clean double. At a
full whip, 3.02 against 3.34. `turnCarry` is a balance lever and is labelled as
one: a third of a revolution at a full whip is a choice, taken so the whip stays
the main source of rotation and the entry still clearly matters.

**Twizzles.** **Z** (pad **X**) held: *"travelling rotation on one foot; hold to
sustain, stick to steer"* (bible §2.1). The same pivot kept going — spun up to
`twizzleRate`, slower with the arms out, a cusp every half revolution — while
the body travels on and the stick bends its path. Let go and it finishes to the
next alignment with the path, so when you let go chooses whether you come out
forward or backward. A twizzle is skated upright over the foot: the body is held
at the lean its path needs rather than balanced through a loop nobody steers at
two and a half revolutions a second. Measured from 5.8 m/s: **two revolutions in
0.84 s for 0.96 m/s** (data: 720° over 4.5 m at 6 m/s for 1.0 m/s); on the right
foot the edge alternates RFO / RBI; a held ±0.4 of stick bends a one-second
twizzle's path ±39° and none leaves it straight.

**Spins.** **Y** (pad **Y**) held at 3 m/s or more (`data/spin-positions.json`'s
entries): *"a continuous negotiation between speed, position and centering, under
a slowly draining angular momentum"* (bible §2.5). The entry hooks the skater's
travel into rotation — `m v spinArm`, cleaner with the upper body checked, which is
the arms held out at the press — and after that L only ever falls: blade friction,
and more of it the further the spin drifts. The position sets the moment of
inertia from the data file's `inertia_scale` (upright 1.0, sit 1.25, camel 2.2, on
its 4.0 kg·m² open baseline; `test/spin.test.ts` holds them to the file), the arms
move it between tucked and open at a jump's pull-in rate, and ω = L / I — so a
camel is slow and an upright fast *"emergently, without any scripting"*, as the
file says. **Knee deep is a sit, stick forward a camel**; change position mid-spin
and the speed changes with it, which is a combination spin. The spinning blade is
on the back edge that curves the way it turns — LBI anticlockwise on the left foot —
and letting go (or running out of rotation) checks out backward onto RBO.

Measured, entered off LFO at 4.5 m/s with the arms in: an upright starts at **4.0
revolutions a second** and drains to 2.3 over four seconds, **11 revolutions**,
drifting **0.29 m** (inside `data/spin-features.json`'s 0.45 m centering); arms out
it is 0.8; a checked entry is 5.0. Each position held two revolutions goes on the
record (`positions`), the data's `min_revolutions`, which is what a level-feature
detector will read.

**The Ina Bauer.** **I** (pad **LB + RB**) held, skating forward: both feet down on
parallel tracks, the lead foot forward and the trailing foot backward, toes turned
out, the body side-on. It is the one move the carve skates itself — the trailing
blade's tangent is reversed, so its tilt is the body's lean read in a reversed
frame, its long speed is negative, and the classifier calls it a back edge. Lean
toward the lead foot's side and both blades are on outside edges, **LFO and RBO**,
which is `data/motion-primitives.json`'s Ina Bauer; the lead foot is whichever side
the body leans at the press, so a lean first gives the outside edges. The side-on
body has more drag (`inaBauerDrag`) and nobody turns a foot out a full 180°, so the
trailing blade scrapes a little (`inaBauerScrub`); together they cost **1.03 m/s in
a second from 5.85 m/s** (data: 1.1 over 6 m at 6 m/s). Held the data's 1.8 s, the
body keeps its lean to within 2° and the curve its direction. (Leaning in only at
the press, while the balance loop is still rolling the lean in, can start one on
inside edges — lean first.)

**Edge and toe jumps, from their entries.** All six jumps were already in the rig;
what the moves add is the way skaters reach them, and a reason for the crossovers
before them. With the moves on, part of a jump's lift is its approach turned
upward — blocked by the takeoff edge, or vaulted over the pick — so a jump's vertical
velocity is `jumpSpeedShare` (0.2) of the reference scaled by takeoff speed over
that jump's `data/entry-templates.json` entry speed for a triple (T 6.8, S 6.6, Lo
6.4, F 7.0, Lz 7.5, A 7.8 m/s), and the rest the legs'. At its own entry speed a
jump rises exactly as `jumpImpulse` says; faster higher, slower lower; what goes up
comes out of the travel. **A toe jump vaults over its pick**: miss the pick's
window and it has nothing to vault over. Edge jumps get their rotation from the
edge's curve and the turn before them (`spinCarry`). A balance lever, labelled.

Measured from 5 m/s backward with the same whip: a loop with no crossovers takes
off at 4.6 m/s, turns 2.61 revolutions and falls; after three seconds of **back
crossovers** it takes off at 7.4 m/s, rises higher, turns 2.83 and lands. A toe
loop off the same crossovers lands (3Tq) with the pick in its window and goes down
a revolution short with the pick too early. And every takeoff is reachable the way
a skater reaches it — a flip (or without the pick, a salchow) off a LFO three-turn
onto LBI, a lutz off clockwise back crossovers and a long LBO, an axel from back
crossovers through an outside mohawk onto LFO — each identified by the resolver
from how it left the ice (`test/entries.test.ts`). In the jump challenge, with the
moves on, the panel shows the entry speed the target wants beside your own.

## What a session measures

`sim/session.ts` computes five of the seven metrics in
[pre-production-plan.md §6](../../docs/pre-production-plan.md), with that
document's definitions, because the §8 kill gate thresholds were signed against
them before any data existed. Inventing a parallel set would produce numbers
that look like evidence and answer nothing.

| | |
|---|---|
| free-play duration | the headline: seconds of voluntary play |
| skid ratio | fraction of ticks where the edge let go — falls as skill rises |
| mean lean depth | best proxy for "they trust the physics" |
| edge changes / minute | exploring versus surviving |
| median time to retry | under 3 s means the failure felt fair — half of gate criterion 3 |

The two it cannot: **figure-eight deviation** needs the Figure Eight task and
its reference curve (gate criterion 2, and the shipping tutorial, so it is real
work rather than instrumentation), and **unprompted actions** needs a human
watching, which the plan says outright.

None of it counts while the skater is down. A fallen body lies at about 89° and
keeps sliding, so the first version of this module reported a mean lean depth of
80° with total confidence.

A fall ends when the tester stands up (a fresh push) or resets. **Time to
retry** is the seconds from the fall to whichever came first, so with the
stand-up it measures exactly what §6 says: fall to next input. **Down seconds**
is the time spent on the ice until then; a fall never got up from counts there
and contributes no retry sample. The stand-up press is neither a stroke nor a
skating tick.

**The export is numbers about a simulation and nothing else** — no names, no
accounts, no free text. That is a privacy position, and it is also what makes
two testers' sessions comparable.

### What the first play report changed

`?playtest=1` hides the sliders, the preset name and the export buttons. What is
left is a rink and a letter — because §7's facilitator rules exist to stop
exactly that kind of leak, and a slider labelled "internal authority" explains a
great deal about why you just fell over.


> *"the button mapping is correct, but the x and y axis on the same control
> stick makes it a little bit more difficult to navigate"*

Two things, and the first was a bug: **the deadzone was per-axis** while this
file's own header described a radial one, so the corner read 1.41 of deflection
against a cardinal's 1.0 and every diagonal was over-reaching. `stick()` now
deadzones and curves the *vector*, which is what a lean vector requires — the
angle you push is the edge you get.

Second, fore/aft is now attenuated by `tan(25°) × |sideways|`, so a sideways
push is a lean and nothing else. Measured: a stick at (0.9, 0.30) — nineteen
degrees off horizontal, which is an ordinary human's idea of "sideways" — used
to move the contact point along the blade and now reads as pitch exactly zero,
with the lean intact at 0.85. A deliberate 45° diagonal still pitches.
`test/pad.test.ts` holds both.

## Putting it in front of people

Two jobs, two pieces, because a static host cannot collect anything and a
collector should not be the front door for contributors.

### The public build — GitHub Pages

`.github/workflows/pages.yml` runs the tests, builds, and deploys
`tools/ice-lab/build/`. The tests gate the deploy on purpose: what goes up is
the thing people are asked to form an opinion about, and a solver failing its
own measurements is not that thing.

`node app/build.mjs` also writes `build/index.html`, a redirect to `app/`,
because the page's own script tag is `./lab.js` and a static host serving it at
`/` resolves that to `/lab.js` and 404s — a blank rink with no error anywhere a
user can see. That happened. The local server redirects; a static host cannot,
so the redirect ships as a file.

### Collecting sessions — `app/collect.mjs`

```sh
COLLECT_TOKEN=$(openssl rand -hex 16) node app/collect.mjs   # :8124
curl -H "Authorization: Bearer $COLLECT_TOKEN" https://your.host/api/sessions > sessions.jsonl
```

One file, zero dependencies. It serves the rig **and** accepts session cards at
`POST /api/session`, appending them to a JSONL file. Same origin by default, so
a rig served by the collector needs no configuration and no CORS; a build hosted
elsewhere points at it with `?collect=https://your.host/api/session`.

`GET /api/sessions` returns 404 unless the bearer token matches, and stays shut
when `COLLECT_TOKEN` is unset. That is the whole authentication story, which is
appropriate for a file of anonymous numbers and would not be for anything else.

**Nothing that arrives is trusted.** The card is rebuilt field by field from a
fixed schema: numbers are coerced and rounded, the scheme is two characters, the
note is stripped to a safe alphabet, unknown fields are dropped, and a body over
64 KB is refused. What lands on disk is what this project defined, not what was
posted.

**No accounts, no cookies, no analytics, no IP logging.** The payload is numbers
about a simulation and nothing about a person. That matters most for whoever is
handed the controller first — often somebody's nephew — and the cheapest way to
comply with every rule about children's data is to hold none of it.

Behind TLS, the whole deployment is:

```
your.domain {
    reverse_proxy 127.0.0.1:8124
}
```

It binds **loopback** unless `HOST` says otherwise, because on a box with a
public IP the alternative is this port answering in plaintext next to the TLS
Caddy is carefully providing.

[`deploy/`](deploy/) has the rest: a hardened systemd unit, that Caddyfile with
client addresses stripped from the access log, and a runbook that takes about
twenty minutes on a fresh box — [`deploy/README.md`](deploy/README.md).

## Reproducible bug reports

The **replay.json** button exports the current run from its most recent reset.
It records the first five minutes of simulation time (36,000 ticks); at the cap
the clip stays intact and the status asks you to export and reset. Pause time
is excluded. Reset starts a new clip while retaining the live session metrics.

Each `edgework-replay/1` file contains the initial speed, lean, complete tuning,
the actual floating-point solver input for every tick after scheme mapping,
the scheme letter, tuning changes before their tick, and a checksum of the full
state and that tick's events. No names, hardware IDs, timestamps or network
requests are involved. **send session** still sends only its existing summary;
replays are exported explicitly and are not uploaded by that button.

Use **open replay** to watch the run. Live skating input and slider edits do
not drive playback; recorded tuning does. Playback pauses on completion or on
the first differing tick. **P / Start** pauses and resumes; **reset skater**
returns to a fresh live run. Playback does not enter the playtest session meter.
In `?playtest=1` the replay controls remain hidden with the rest of the panel.

For a bug report, attach the replay and verify it without opening a browser:

```sh
node replay/verify.ts /path/to/edgework-replay.json
# or: npm run replay -- /path/to/edgework-replay.json
```

Exit codes: **0** verified, **1** state/event divergence (with the first 1-based
tick and expected/actual digest), **2** invalid or incompatible file. Imports
require the exact schema, solver version, 120 Hz rate, complete finite tuning,
bounded input axes, boolean buttons, at most 36,000 ticks and at most 64 MiB.
Warnings about balance tuning are preserved so a bad tuning can be reproduced.

`ice-lab-f64/6` is a JavaScript regression contract. CRC32 covers every state
field and event using canonical JSON, with straight-blade Infinity encoded
explicitly; it is a diagnostic, not an authenticity signature. **A clip
verifies in any JavaScript engine**, not only the one that recorded it: every
transcendental the solver uses is `sim/math.ts`'s own, built from `+ - * /` and
`sqrt`, which IEEE-754 fixes to the bit. Up to `/3` the solver called the
engine's `Math.sin` and friends, and a Firefox recording diverged in Node at
tick 1437 over one ulp of a cosine; under `/4` the same inputs give the same
4,742 digests in Firefox 155 and Node 26. `test/boundary.test.ts` keeps raw
`Math.*` transcendentals out of `sim/`, and `test/math.test.ts` pins the bits.
It does **not** establish parity with the future C++ float32 solver. Version
the contract when solver semantics change and review fixture changes rather
than regenerating them to pass CI.
The bump from `/1` to `/2` added `pushHeld` to the state (standing up after a
fall is edge-triggered) and the knee floor on strokes; the fixture was re-run
from its own recorded inputs, and its kinematics matched the `/1` solver
tick for tick, so only the digests changed. `/2` to `/3` added jumps: `jump` and
`landed` on the state, `carriage` and `toe` on the input. With jumps off the
fixture's 240 ticks matched the `/2` solver on every shared field and event.
`/3` to `/4` swapped the transcendentals: kinematics moved by ulps (fixture
positions within 2.2e-16 m of `/3`, a 4,742-tick play clip within 6.5e-12 m,
same falls on the same ticks), so the fixture was re-run from its own inputs.
`/3` clips no longer load; verify one against a checkout of `34fecd8`.
`/4` to `/5` added the moves: `movesMode` and its levers on the tuning, what they
carry on the state. With the moves off the fixture and three play clips, 22,184
ticks, matched `/4` on every field and event; `/4` clips verify against `9400137`.
`/5` to `/6` gave the stance its rate term and aim (finding 9); with both at 0
the fixture and the play clips matched `/5` on every field and event, and `/5`
clips verify against `8d89af2`.

`test/fixtures/replay-v1.json` pins a 240-tick skating run with a tuning change
at tick 121. PR checks run the tests, browser build and fixture verifier under
Node 24 and 26. The fixture uses mapped inputs; it does not validate hardware
mapping, which has its own scheme/pad tests.

Local measurement on Node 24.19 (36,000 ticks, after warmup): about 29 µs per
tick for solver plus capture and 5.3 MB of JSON for five minutes of a scripted
run. This measures the headless JS instrument, not browser rendering or the
future C++ performance gate; recording allocates outside the solver.

## Layout

```
sim/math.ts        vectors, deterministic wrappers, mulberry32, CRC32
sim/types.ts       the vocabulary; the packed edge code and its "RFO" spelling
sim/params.ts      every tunable, their sources, validation, and the presets
sim/blade.ts       effective rocker, carve radius, bite capacity, skid onset
sim/solver.ts      one skater, one fixed tick, a pure function
sim/classify.ts    continuous blade state -> the discrete edge vocabulary
sim/telemetry.ts   fixed ring, CSV export, event log
sim/session.ts     the plan's §6 metrics, computed from what the rig can see
sim/replay.ts      bounded capture, strict import, full-state checks and playback
sim/jump.ts        load, air, land: JumpResolver.cpp, and the panel's calls
sim/score.ts       one jump's score, from the data files: ScoreCalculator.cs
sim/profile.ts     who is skating: body, blade wear, five stats, baked over a preset
sim/moves.ts       the moves: turns and twizzles (a pivot, cusps, frame flips), spins (L, I and drift), the Ina Bauer, and the carry into a jump
replay/verify.ts   command-line replay verification
app/pad.ts         controller and keyboard: hardware, and nothing else
app/schemes.ts     A, B and C — what an axis MEANS, as pure functions
app/loop.ts        the 120 Hz accumulator and its dt clamp
app/draw.ts        skater, blades, carve circles, force vectors, tracings, HUD
app/padview.ts     the input panel: hardware as read beside the solver input
app/ribbon.ts      the Edge Ribbon
app/audio.ts       the edge tone and the jump one-shots
app/panel.ts       the sliders
app/lab.ts         wiring
app/build.mjs      TypeScript -> browser JS, no dependencies
app/serve.mjs      static server that will not cache
app/collect.mjs    the same, plus somewhere for a session card to land
deploy/            systemd unit, Caddyfile, and the runbook for a real box
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

Spin scoring and levels, spin variations beyond the three basic positions, flying
entries, turns beyond the three-turn, mohawk and twizzle (brackets, rockers,
counters, choctaws), falls beyond their trigger, animation, networking, stamina,
flow, combinations and sequences, and the ice grid (tracings are
drawn, but they do not yet feed friction or bite back into the solver as the
bible's §05 requires). The stroke is the design bible's semi-analytic push, not
a leg model.

## Porting it

The whole point. `sim/` is written to be transcribed:

- SI throughout — metres, seconds, kilograms, newtons, radians.
- Plain data and no engine objects. The current TypeScript `step` allocates
  vector objects and arrays; the C++ port still needs an allocation-free hot loop.
- `step(state, input, params, dt, events)` is a pure function.
- Math helpers live in `sim/math.ts`, but direct `Math.*` calls remain in the
  solver and blade model. Audit them when choosing the C++ math contract.
- The checksum quantizes by truncation, which is exact in IEEE-754 and
  identical on every target; rounding modes are not.
- The edge code's bit layout and its `RFO` spelling are already what
  `data/jump-definitions.csv` uses.

Export a tuned parameter set with **params.json** in the panel; it emits only
what differs from `spec`, which is what a tuning-log entry should contain.
