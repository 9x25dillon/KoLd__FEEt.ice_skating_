# Ice Lab — a browser tuning rig for edgework

## Play Ice Run

The game's sports-anime presentation pairs an original illustrated opening screen
with procedural cel-shaded skaters: ink outlines, angular hair, directional faces,
geometric costume panels, two-tone fabric shadows, and restrained action strokes
at high speed. Both Violet and Aurora retain their selectable outfits. The key
visual is bundled locally in `game/art/`; the live athlete is canvas-rendered and
still follows the solver's pose, rather than using the illustration as a sprite.

`game/` is a standalone browser game on the same 120 Hz solver as the lab, with
a close, angled momentum camera: it follows **velocity**, not body heading, so
turning backward, twizzling and rotating in the air do not spin the view around
the athlete. Camera-relative controller aiming is transformed back into world
space before scheme B maps it to a physical lean. **V** switches between the
momentum view and the rink overview; the mouse wheel or **+/−** changes zoom.

```sh
cd tools/ice-lab
node app/build.mjs
node app/serve.mjs
```

Open **http://localhost:8123/game/**. Use **A/D or left/right arrows** to steer,
tap/hold **Space** to push (fresh tap to get up), **X** to brake, **P** to pause, and **R** to
restart. On a controller, the left stick aims in a direction across the ice,
**A** pushes, **LT** held brakes, **Start** pauses, and **Back** restarts. **Y is spin.** Keyboard or
controller required; touch controls are not implemented. **U** holds the low pose;
**comma (,)** winds up a jump. The lab retains **U** for wind-up. A low pose
suppresses wind-up, including right-stick wind-up, so it cannot arm a later jump.

The opening card offers four modes. **Free Skate** is open practice: seven
objectives worth 250 points each, once per run (`game/practice.ts`), plus a FLOW
meter that rewards staying upright at speed and unlocks a scattered field of
snowflakes and pucks to knock into gold targets (`game/playground.ts`). The
**Rookie course** is a guided, curved 8-gate lane with two jump bars; clipping a
cone costs 25 points, and the HUD tracks gates cleared against a clean run
(`game/rookie.ts`). The **90-second light run** chases gold lights in order;
pickups within 8 seconds build a chain up to ×5 — silver is 1,500 points, gold
3,000 (`game/run.ts`) — and your personal best stays in this browser when
storage is available. Jumps and moves are enabled in every mode.

**Career mode** opens a five-event season, from First ice through the Championship
program. Each event has a timed, ordered choreography of glides, edges, crossovers,
clean jumps, spins and closing poses. The coach shows the current instruction,
hold progress, and the routine checklist. Moves count from actual solver results;
a jump performed before its cue cannot count later. Falls reset the current hold,
but keep completed elements. Finish before the deadline to unlock the next event:
bronze for completion, silver with at most two falls, gold with no falls.

Each improved medal tier awards 150 XP once. The Career board lets you spend XP
on push power, jump spring, edge control or balance, using the existing profile
training costs. That career profile applies on the next career start; practice
uses its selected sample profile. Completed medals and training save locally in
this browser. If storage is unavailable, progress lasts for the session. Replays
capture the baked skating physics, but playback does not award career progress.
The routines are authored move sequences, not a choreography editor or beat-window
judging system. Music and musical credit still work alongside the routine.

**Difficulty**, in the Controls window, is Beginner or Simulation and starts a
new run. Beginner softens keyboard lean and hands the on-screen **trick** button
(or J / D-pad up) a full spin jump: it loads the knee, then bisects the arm
carriage against a landing rotation predicted with the same fixed-step inertia
and ballistic equations as the solver (`game/beginner.ts`), so the assist only
ever chooses an input sequence — it never writes skater state. Simulation turns
that off; jumps are the manual load-and-release, same as the lab.

Free Skate starts with **Cruise** enabled. It supplies ordinary solver pushes
below 5.5 m/s while gliding, and stops supplying them during braking, falls,
jump loading and moves. Turn it off for manual strokes. Holding **Space / pad A**
also repeats pushes.

The **Controls** window exposes all three mappings with assisted tuning, the four
sample skater profiles and the difficulty toggle (changing either starts a new
run), and replay export and playback. Recording captures actual solver inputs,
parameters, events and state digests for the first five minutes. Imports enforce
the engine's schema and size limits, lock out live skating input, and stop on
completion or first divergence. Replay preserves physics; the simplified
cantilever pose overlay is not recorded.

Landed jumps receive the engine's data-backed technical score, shown separately
from practice, playground or light-run points. **Sound** enables the existing
blade, skid and jump audio. Separate ice tracings follow the two blade contacts
and break while airborne. The athlete uses the engine's body pose, including
knee compression, height, lean, arm carriage and spin positions.

**Style** opens a wardrobe with the original **Violet** outfit and the optional
**Aurora** teal-and-gold outfit with a ballet bun. It is also available from the
opening card. Selection applies immediately without resetting a run, and is
remembered in this browser when storage is available. The wardrobe pauses skating.

The game adds contact-driven ice spray for braking, skidding and deeper carves,
plus a burst and brief result card for each landing (including step-outs, two-foot
landings and falls). Bent elbows, push-driven arm swings, a rippling skirt hem and
speed-responsive ponytail motion build on the solver's body pose. These effects
are cosmetic: they never change physics, scores or replay data. They freeze while
paused and clear when starting a run or importing a replay. Reduced-motion system
preferences reduce particle density and disable decorative ripples and landing rings.

Collected snowflakes dissolve into sparkles with floating points. Puck goals and
timed-run lights briefly illuminate their targets; jump and spin practice rewards
also show the points actually awarded. Celebrations pause with the game, expire
quickly, and respect reduced motion. They do not change scoring or pickup cooldowns.

**Music**, in the Controls window, picks one of five tracks (`game/audio/`);
**Sound** starts and stops its playback alongside the procedural audio. Each
track's estimated tempo drives the rhythm layer (`sim/music.ts`, `musicMode`):
a crossover push lands in a beat window — full strength on tempo, weaker with
an audible chop off it, never a failed push — and a three-turn or a jump
landing near a downbeat earns musical credit, shown as "Musical credit" and
not yet spent by anything. Playback is presentation-only and never reaches a
replay; `game/audio/README.md` covers where the tracks came from and why
their tempo is an estimate pending hand correction.

**The boards** (`game/rink.ts`) bound the rink scene.ts already draws: skate
into one gently and it bounces the skater back onto the ice; hit one hard
enough (past `CRASH_SPEED`, 3.5 m/s of perpendicular impact) and it is a fall,
the boards named as the reason. Presentation-layer, like the music: applied to
the state a frame renders, never inside `sim/`'s own `step()`, so a replay's
recorded digest stays pure regardless of which wall a run touched — watching
that replay back re-applies the same collision live, so it still looks right,
it is simply not what a divergence check compares against.

This does not implement every feature in the design bible. Stamina depletion,
ice wear feeding back into grip, a full career/competition system and the future
native runtime are not present in this game. Game rules live in `game/run.ts`,
`game/rookie.ts`, `game/playground.ts`, `game/beginner.ts` and `game/rink.ts`,
separate from the physics. The original lab retains its course, ghost-race,
telemetry and tuning tools at `/app/`; build output includes the game as a
separate module page, and the lab's single-file bundle still contains only
the lab.

**Controls** opens a complete keyboard/controller guide and pauses skating:

| Move | Keyboard | Controller |
| --- | --- | --- |
| Jump | Hold Shift ~0.3 s, release; bend again in the air for landing | Squeeze/release RT |
| Toe pick | Tap F near the end of the jump load | Tap LT |
| Arms open / tuck | Hold/release C | Right stick out / centred |
| Weight left / right | Q / E | LB / RB |
| Three-turn into backward skating | Carve, tap B, keep the same foot | Carve, tap B, keep the same bumper |
| Mohawk | B, transfer Q ↔ E during turn | B, transfer LB ↔ RB |
| Bracket (three-turn's mirror, against the curve) | Tap N instead of B | Click the right stick instead of B |
| Forward / back crossovers | Push on a curve; turn backward first for back crossovers | Same with A and stick |
| Spin | Hold Y; Shift for sit, W with knee released for camel | Hold Y; RT for sit, right stick forward with RT released for camel |
| Twizzle | Hold Z | Hold X |
| Ina Bauer | Hold I while gliding forward | Hold LB + RB |
| Cantilever pose | Hold U while gliding | Hold D-pad down |
| Change control scheme | M | Keyboard M |

The cantilever is a simplified animated low-back pose over the existing two-foot
glide, with knee compression below the jump-load threshold. It does not implement
dedicated cantilever balance physics. Releasing it does not charge a jump.
The skater rendering shows separate feet, pose changes, airborne height and spin;
the HUD reports current moves, forward/backward glide, edges and the last landing.

Assisted steering is the default. Game-only backward steering aims relative to
the travel frame rather than demanding a reversal, and keyboard direct lean is
scaled to a manageable shallow edge rather than the lab's full deflection.

A 120 Hz, deterministic, inertial implementation of the KoLd__FEEt blade–ice
model, with every constant on a slider and the whole thing running in a
browser. It exists so the questions in
[`docs/open-decisions.md`](../../docs/open-decisions.md) and the risk register
in the engineering package get answered in seconds rather than in UE5 compiles.

**It is not the game and it is not an engine.** [D2 is
closed](../../docs/open-decisions.md#d2--engine) — Unreal Engine 5.4+, resolved
2026-09-03 — remains the historical studio plan. The operator selected Godot 4
for the playable rebuild on 2026-09-15; see [the Godot project](../../games/ice-run-godot/README.md). This is the Ice Lab from EDGE-019,
built early and built cheap, so that `KoLdSimCore` can be written in C++ as
transcription rather than as discovery.

```sh
node --test test/*.test.ts     # full simulation and gameplay suite
node app/build.mjs             # -> build/
node app/serve.mjs             # -> http://localhost:8123/
node demo.mjs                  # scripted runs to watch -> build/demos/ (import replay)
node validate.mjs              # the fidelity gate, headless (--json for CI)
node validate.mjs --report ../../docs/fidelity-report.md   # regenerate the committed report
node validate.mjs --clips build/clips   # and every run as a replay clip: open one with import replay to watch its inputs
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
carriage (flicked **right** before the release, the wind-up), **B** toe pick, **D-pad ↑** jump mode (and past full jumps, the moves), **D-pad ↓** camera view, **D-pad ← →**
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
arms' authority; **stamina** conditioning: a stat-100 skater's baseline Wind
drain and per-push Legs cost both run at half a neutral skater's (§2.8, below).
Mass goes straight in and does less than a player will
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

## The career — events, medals, training, and the stat gate

`game/career.ts` is the game half of the profile layer above: `CareerState` holds five events
(`CAREER_EVENTS`, "first ice" through a championship program), a medal per event, and the
`SkaterProfile` those medals train. `Choreography` samples the live solver each tick against one
event's ordered routine — glide, edge, crossover, jump, spin, pose — and awards nothing for a button
press, only for the state the solver actually produced: a spin needs a full new revolution while
`s.move === MOVE.Spin`, a jump needs a landing tick that has not already been used, a pose needs the
skater grounded and moving. Falls count and downgrade the medal without blocking the routine, so a
program is always finishable. Only an *improved* medal pays XP (`award`), so retries cannot farm it,
and `train` spends it on one of the five stats through `sim/profile.ts`'s quadratic price curve. A save
is one versioned JSON blob (`serialize`/`restore`) that rejects a corrupt or incompatible one, or a
broken unlock chain, rather than trusting it.

**Every import here is `sim/`** — `types`, `jump`, `profile` — so `CareerState` and `Choreography` are
as pure and replayable as a run, even though the file lives in `game/` rather than a dedicated
`career/`: nothing about them needs the DOM.

**The stat gate (2026-09-17).** Added on the operator's own call: the queued "stat balance tied to the
competitive scoring", with `overall()` and the tier floors as the literal attachment points. Before
this, `unlocked` was medals alone — a skater who never opened the training menu could still walk the
whole ladder on a clean program. Now `CareerState` tracks two caps and takes the lower:

- **`medalCap`** — what medals alone would unlock: the old `unlocked`, unchanged, the first
  not-yet-earned event.
- **`statCap`** — what the skater's own stats permit: the highest of `sim/profile.ts`'s five `TIERS`
  (club, regionals, nationals, grand prix, worlds) whose floor `overall(profile)` clears. `CAREER_EVENTS`
  and `TIERS` are the same five rungs, index for index — `test/career.test.ts` asserts the lengths match
  so the two lists cannot drift apart unnoticed.

`unlocked` is `Math.min(medalCap, statCap)`. A neutral, untrained profile (`overall` 50) already clears
club (0) and regionals (40), so a new career is never stat-locked out of its first two events; nationals
(55) is where training stops being optional — a program cleaned to gold at event 1 cannot open event 2
until the skater is actually trained for it. The career board's own button now says which cap is
binding: *"Complete the previous event to unlock"* for the medal cap, *"Train to nationals overall (55)
to unlock"* for the stat cap, so a blocked player is told which menu to open.

**Checked against the profile layer's own sample skaters** (`SAMPLE_PROFILES`, `sim/profile.ts`), and
the names line up with no tuning: club novice's `overall` 20.85 caps at **club**, the reference skater's
50 at **regionals**, nationals senior's 61.12 at **nationals**, worlds medallist's 90.37 at **worlds** —
the same ladder both systems were already named after, now actually connected.

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

### The wind-up, and the arms it flies for you

Added 2026-09-13 on the operator's direction. The arms can be partly automated from the jump's own
geometry, but only after the skater commits: a **wind-up flick against the rotation** before the
release. That is **U** on the keyboard, or the **right stick thrown right** in schemes A and B (C's right
stick is a blade, so C winds on the keyboard only). A flick left, with the rotation, takes the commitment
back. A flick more than `windupWindow` (0.6 s) before the release has expired.

A wound-up jump does two things, both scaled by `jumpAssist` (`spec` 0.25, `responsive` 0.5, `assisted`
0.8):

- **At takeoff**, the whip is at least `jumpAssist` × the flick. The shoulders unwinding is the whip, and
  the assist is how much of it happens for you. On `assisted`, the flick alone is enough to rotate.
- **In the air**, the carriage is blended `jumpAssist` of the way toward what the geometry asks for.
  `rotationToLand` runs the rest of the flight tick for tick, with the same ballistics and arm rate as
  `jumpAir`. The target is the nearest whole revolution (half, for an axel) that the takeoff can really
  reach with the arms pulled in. `assistedCarriage` then bisects for the arms that land exactly on it.
  That means full tuck when the target is out of reach, and opening early to check out when there is
  rotation to spare.

It moves the moment of inertia and nothing else. Angular momentum is still set at takeoff and conserved,
and air time is untouched. So the assist never finds rotation the takeoff did not buy, and a skater who
holds the arms out against it still comes down short.

Measured, `test/windup.test.ts`:

| Jump | Manual | Wound up |
| --- | --- | --- |
| `responsive` toe loop, full whip | 3T, 3.041 rev, LQ 0.53 | 3T, **3.000**, LQ 0.61 |
| `spec` at a deeper edge | 3T, 3.107 (over-rotated) | 3T, **3.002** |
| `assisted`, half a whip | 2T< and a fall | clean 2T, **2.000** |
| `assisted`, no whip | — | clean 2T, **2.000** |
| `spec`, a takeoff short of a triple (2.812) | 3Tq | the same 2.812: nothing found |

With no wind-up nothing arms, and the jump is the manual one bit for bit. Replay contract `/8` added the
input and the levers. Replayed through `/7` and `/8`, the fixture and four operator clips (49,539 ticks,
including the operator's two jumps) matched on every `/7` state field and event.

**Watch it.** `node demo.mjs` writes `build/demos/`: a carve figure, and this toe loop manual, wound up,
wound the wrong way, and wound up on `assisted` with no whip at all. Each is a replay clip to open with
**import replay**, where the input overlay shows every stick and button tick by tick, next to a `.txt`
timeline of the same inputs.

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

## The rink's shape

The ice is not a plane. `rinkRelief` is centre ice minus the boards, on a 60 × 30 m sheet centred on the
origin: positive is a crown, negative a bowl, and the surface between is a paraboloid that is flat past
the boards. **O** cycles the named shapes in `RINKS`:

- **flat:** a competition sheet, and every preset
- **public:** a +4.5 mm crown, from session skating wearing the outer ice down
- **barn:** a −9 mm bowl, from an old thin slab settling

The shapes are the operator's field observations. Their sizes are chosen, not measured (L3), to be
barely perceivable: at the side boards, the pull is a tenth (public) or a fifth (barn) of flat-glide
friction.

Gravity along the ice is applied only along the travel, in the losses (`sim/solver.ts` §5). Across the
travel the edge holds, and that load is under a thousandth of g. A skater standing still stays still.
The rink is not applied in the air or through a turn's pivot. At 0 relief the solver skips the rink
entirely.

Replay contract `/7` added these three levers and nothing else. Replayed through `/6` and `/7`, the
fixture and four operator clips (49,539 ticks, twelve falls, two jumps) matched on every state field
and event on every tick. `test/rink.test.ts` holds the pull's direction and closed form, the paired-glide
rule the validation cases rely on, and the bit-for-bit flat sheet. `?playtest=1` never leaves flat.

## The ice itself — wear, snow, and what it costs

Added 2026-09-16 (`sim/ice.ts`), the physics half of the operator's queued "carve as a feature": design
bible §3.2, *"a 2D grid over the rink at roughly 12 cm resolution storing damage and snow. Every blade
pass writes to it; damage raises local friction and lowers bite, and snow accumulates in ridges at
stops... Resurfaced between skaters, which is why the last skater in a warm-up group is genuinely at a
disadvantage."* The bible also names this grid as the tracing buffer (§04, §09) — one system behind both
the physics and whatever draws a line on the ice.

**`IceGrid` is explicit state, not a hidden global.** `sim/solver.ts`'s own header explains why: replays,
ghosts and server verification depend on `step()` being "state in, state out... no hidden globals", and a
grid this persistent cannot live inside it. It is passed into `step()` as a sixth, optional argument
instead — the same reason `SkaterState` is passed rather than owned — so a replay never has to serialize
it: the same recorded inputs chew the same ice, deterministically, on any machine that replays them.
`iceGridMode` is 0 in every preset, the way `movesMode`, `jumpMode` and `musicMode` are, and `step()`'s
`ice` argument being merely absent has the same effect: with neither, friction and bite read exactly what
they did before this file existed. `run()` (tests, the replay path) takes the same optional argument.

Damage and snow are stored apart but read back as one blended `condition` (0..1, saturating): both alike
raise `muLong` toward `iceMuChewed` (0.015, the bible's own ceiling) and lower `biteCapacity` by up to
`iceBiteLossMax`, because the rig has no way yet to tell a judge a chewed patch from a snow ridge apart.
Every blade pass adds `iceDamagePerPass`; snow additionally comes from skid scrub — `latSlipAccel`, the
same quantity solver.ts's own step-5 comment names as *"where the snow comes from"*, deposited at the
blade's position instead of only being spent as a speed loss. None of the four levers has a data file
behind it (open-constants.md), so all are L2/L3, authored to be visible over a session's laps rather than
a single stroke.

**Measured** (`test/ice.test.ts`), two skaters on the same fresh `spec` grid, gliding straight at 5 m/s
for 2.5 s each, one behind the other: the first keeps 4.5158 m/s, the second — same start, same input,
ice the first skater already chewed — 4.5032 m/s. Small on purpose (`iceDamagePerPass` defaults to a
sheet that dulls over a warm-up group's laps, not one lap), but the right sign and the bible's own claim,
checked rather than assumed. A `resurface()` between them gives the second skater the first one's own
deal back, exactly.

Replay contract `/10` added `iceGridMode` and the three levers under it, and nothing to `SkaterState` —
the grid is not part of it. Replayed through `/9` and `/10` with no grid passed, the fixture and three
operator play clips matched on every `/9` state field and event on every tick; the fixture was
re-recorded from its own inputs only to carry the four new keys.

Not yet built: reading `condition()` back into a persistent, whole-run trace (today `app/draw.ts` keeps
only each foot's last ~30 seconds) and a live "off the line" number for a course. The operator's own
call, asked directly rather than assumed from an old note: the line a course scores against is a
**designed curve** — hand-authored per course, the way the Figure Eight's two circles already are
(`app/figure8.ts`, `deviation()`) — not a replay re-simulating as a ghost. That pattern is proven and
reusable the moment a course wants one; none has asked for a second yet.

## Stamina — Wind and Legs

Added 2026-09-17, the last item on the operator's own queue: design-bible.md §2.8's two pools. Off in
every preset (`staminaMode`), the way jumps, moves, music and the ice grid are — with it at 0, or with
neither pool ever moved from its starting 1, every effect below is inert and `sim/solver.ts` reads
exactly what it did before this file existed.

`src/reference/SkateSolver.cpp` **calls** `UpdateStamina`/`StaminaGain` but never defines either — only
one number survives from it, `S.LegPool -= 0.011f * Knee`, taken directly as `staminaLegsPerPush`. Every
other lever here is authored from the bible's own table, L2/L3, first-pass-calibrated rather than
measured.

**Wind** (aerobic) drains continuously from elapsed time and speed² and recovers only while genuinely
low-effort — not stroking, not turning, `|tiltCmd|` shallow (`staminaLowEffortTilt`) — and recovery is
deliberately much slower than the drain it undoes, so a brief breather is not a reset button. **Legs**
(anaerobic) drains from four distinct events — a push (knee-scaled, the sourced number above), a jump
takeoff (flat), a held sit spin, and holding an edge **past** `depthShallow` (ordinary cruising is free;
only the genuinely deep part of an edge costs anything) — and recovers the same way Wind does, but
**gated by Wind**: below `staminaLegsRecoverWindFloor`, Legs do not come back at all, however long the
rest.

**What Legs feeds back** (all computed once per tick into `pFatigue`, a `Params` blended by the current
pool value and never mutated back into the caller's own object — the same pattern `iceOn`/`condAt` use
for the ice grid):

- **Jump height.** `jumpImpulse` scales `staminaJumpImpulseMin` (0.82, the bible's own number) at Legs 0.
  Measured, a clean takeoff from `responsive` at 6 m/s: takeoff v<sub>z</sub> 2.940 → 2.411 m/s fresh to
  spent, height 0.441 → 0.296 m.
- **Pull-in.** `inertiaTucked` rises toward `staminaInertiaFloorMax` (1.55 kg·m², the bible's own ceiling)
  as Legs empty — the same lever a jump's air phase and a spin's sit position both already read, so one
  change reaches both without touching `jump.ts` or `moves.ts`.
- **Edge depth.** `maxLean` and `maxTilt` both shrink by up to `staminaMaxLeanLoss` (8°). Measured,
  holding a 0.3 rad command from `responsive` at 5 m/s for 200 ticks: fresh reaches 0.3308 rad of blade
  tilt, spent only 0.2886 — an exhausted skater visibly cannot commit as deep an edge on the same command.
- **Balance noise.** A deterministic perturbation (`rng(s.tick)`, reseeded every tick — never a live
  random stream, so a replay reproduces the same wobble on the same tick) added to the balance loop's
  lateral command, amplitude `staminaBalanceNoiseBase` at Legs 1 rising to ×`staminaBalanceNoiseMax`
  (2.4, the bible's own multiplier) at Legs 0. The one genuinely new mechanic here: the balance loop had
  no noise term of any kind before this.

**What it found.** Wiring `wind`/`legs` through the existing "get up after a fall" reset
(`Object.assign(s, createState(p), {...preserved fields})`) surfaced a real bug in the making: neither
field was in the preserved set, so every fall would have handed a fatigued skater back their full pools
for free. Fixed by adding both to the preserved destructure — a fall now costs what it always cost
physically, nothing more, nothing less.

**Not built here, on purpose** (bible §2.8's own "management is where the strategy lives" is a whole
program-design layer, not an engine primitive): front/back-loading jumps for the back-half bonus,
building a spiral in as a breathing bar, and — the operator's own bridge, quoted in an earlier
hand-off — stamina/flow/hype stacking into more assist as a program goes well. That reads FROM these
pools once they exist; building it before they existed would have been reading from nothing. The flow
scalar itself (bible §2.6) is a separate, still-unbuilt system this file deliberately does not touch,
though the bible names it as a future modifier on Wind's own drain rate.

`sim/profile.ts`'s **stamina** stat, previously the one row in `STAT_EFFECTS` doing nothing ("the rig
has no Wind or Legs pool... when the pools land this row binds their capacities" — its own comment, now
out of date on purpose), binds to two representative levers, one per pool: a stat-100 skater's baseline
Wind drain and per-push Legs cost both run at half a neutral skater's, a stat-0 skater's at one and a
half. Recovery rates are deliberately left untouched by training, so conditioning buys a longer program
before fatigue bites, not a faster bounce-back mid-program. `test/profile.test.ts`'s reminder test —
"stamina has no physics yet" — is retired along with the gap it recorded.

Replay contract `/11` added `staminaMode` and its fourteen levers to `Params`, and `wind`/`legs` to
`SkaterState`. The pools themselves are never part of the replay format, for the same reason the ice
grid is not: they are fully determined by the same recorded inputs that determine everything else.
Replayed through `/10` and `/11` with `staminaMode` 0, the fixture and three operator play clips matched
on every `/10` state field and event on every tick; the fixture was re-recorded from its own inputs only
to carry the new keys.

## Hype — the bridge between the music and the career

Added 2026-09-17, directly on the operator's own words: *"the stamina, strength, flow state and hype
from successive trick landing has to be the bridge between the musical and career parts of the
game... all those should sequentially stack engaging more and more assist engines with performance
increases."* Not in the design bible under this name — authored from that brief, L3 throughout — and
deliberately does not wait for the flow scalar (bible §2.6), a separate, still-unbuilt system. Off in
every preset (`hypeMode`), the same convention as everything else on this page.

**Hype builds from a clean landing** (no fall, step-out or two-foot), scaled by its own
`landingQuality`, with a bonus that compounds the longer the streak already is, plus a flat bonus when
the same landing also earned a `musicMode` accent (sim/music.ts) — the literal "read the music engine's
credit as an input" the operator asked for. **It costs**: a proportional share on a fall
(`hypeFallLoss`, 50% of whatever was banked), a reset of the streak on any landing that is not clean,
and a slow continuous decay so a banked meter is not a permanent buff. Measured, three otherwise
identical landings differing only in the streak already in hand: 0.0411 → 0.0473 → 0.0535 hype, each
one bigger than the last.

**What it feeds back**, blended into `pEff` — a `Params` built from `pFatigue` (stamina's own blend)
plus hype's own layer on top, so a performance streak can buy back part of what fatigue just cost,
which is the entire point of a bridge between the two: `controlLatency` shrinks toward
`hypeControlLatencyMin` (0.7×), `internalMax` grows toward `hypeInternalMaxGain` (1.3×), and
`angulationLimit` toward `hypeAngulationGain` (1.15×). Measured, a 0.5 rad lean command held for 10
ticks from `responsive`: `tiltCmd` reaches −0.359 rad at hype 0, −0.521 at hype 1 — the same command,
answered faster and deeper the more hype is banked.

**What it found.** Wiring hype's landing-credit bonus to `musicMode`'s own accent surfaced a real,
pre-existing bug: a landing resolves *inside* `jumpAir`, on `step()`'s §0b early-return path — the
only path there is, every landing takes it — which returns immediately afterward. Section 11's music
credit lived AFTER that return, so a jump's landing could turn a jump but could never actually credit
music; only a turn's cusp ever could. Silent, because no existing test drove a jump with `musicMode`
on and checked `musicCredit` itself. Fixed by factoring the event scan into a shared
`landingAndTurnCredit` function, called from both the early-return path and the normal end of a tick.
`musicMode` is 0 in every preset, so no recorded measurement moved — verified by replaying the fixture
and three operator clips through the old and new contract and finding every field and event identical.

Replay contract `/12` added `hypeMode` and its eight levers to `Params`, and `hype`/`hypeStreak` to
`SkaterState`, alongside the landing-credit fix above. Neither is part of the replay format's grid or
pool exceptions — they are ordinary `SkaterState` fields, replayed the way every other one is.

## Flow

Added 2026-09-17, the last piece of the operator's own bridge quoted above — stamina and hype are the
"stamina... and hype", this is the "flow state" the same sentence names. Design-bible.md §2.6: *"a
single value in [0,1], integrated continuously"*, rising with clean unskidded edges and continuous
motion, falling with skids, flat feet, stopping, and re-crossing already-damaged ice. Off in every
preset (`flowMode`), the same convention as everything else on this page.

**Only part of the bible's own table is modelled.** Rises with a real held edge (`REGIME.Carve` or
`.Edge`) while moving; falls with a skid, a flat blade while moving, or falling under moving speed;
falls again, separately, while re-crossing ice the grid (`sim/ice.ts`) reports at or past
`flowDamagedIceThreshold` — a modifier alongside carving, not a veto: a good edge still gains flow on
chewed ice, just less of it, the same comparative shape the ice grid's own "last skater in a warm-up
group" measurement uses. A flat bonus, `flowBeatGain`, applies when the same turn or landing that
already earns `musicMode` credit lands on the beat grid. **Not modelled**, the bible's own remaining
three bullets: "alternating lobes", "repeated lobes in the same direction", and "dead air between
elements" — none has a clean per-tick signal yet.

**Feeds stamina efficiency**, the one link with an actual bible quote behind the number: *"high flow
means you carry speed and push less, so it is literally cheaper to skate well."* Wind's own drain
(`solver.ts` §12) is scaled by a flow-dependent multiplier down to `flowStaminaEfficiencyMin` (0.6) at
flow 1 — active only while both `flowMode` and `staminaMode` are on, read as last tick's flow, the same
one-tick lag `pFatigue`/`pEff` already carry. The bible's other three consumers — PCS's Skating Skills
and Composition, camera bloom, and the crowd clapping along — are presentation or scoring-architecture
layers this rig does not have yet, and are not touched here.

A fall resets flow to 0 rather than preserving it the way `wind`/`legs`/`hype` do — the one deliberate
difference from that precedent, since a fall is a harder break in continuous motion than anything else
in the bible's own "falls with" list, and the field simply is not in the get-up path's preserved set.

**Measured** (`test/flow.test.ts`): 2 s of a held carve from a 5 m/s glide reaches flow 0.6771; 1 s
flat from a full 1.0 drops to 0.7500. Stamina efficiency's effect is small at this calibration over 5 s
of stroking — Wind at 0.9950 (flow 0) against 0.9959 (flow 1) — proportionate to how little Wind itself
drains over 5 s in the first place; both scale together over a longer program.

Replay contract `/13` added `flowMode` and its eight levers to `Params`, and `flow` to `SkaterState`.

## Wiring it all in — the ice grid, stamina, hype and flow, live

Added 2026-09-17. All four of the above shipped as `sim/`-only work: real, tested, calibrated, and
**inert in actual play** — `GAME_PARAMS` never turned any of their `Mode` flags on, so a player never
saw a single tick of them. This closes that gap.

**`GAME_PARAMS`** (`game/controls.ts`) now sets `staminaMode: 1, hypeMode: 1, flowMode: 1, iceGridMode: 1`
alongside the moves/jumps/music it already had on. `BEGINNER_PARAMS` spreads `GAME_PARAMS`, so beginner
mode inherits all four; no separate decision needed.

**A live `IceGrid`.** `game/main.ts` creates one in `start()` — a fresh sheet each run, "resurfaced
between skaters" — and passes it to the live `step()` call. `games/ice-run-godot/bridge/engine.mjs`
(a hand-maintained mirror of the same host logic, for the Godot bridge) needed the identical fix.

**What it found, twice, the same bug in two places.** `sim/replay.ts`'s `ReplayPlayer` never owned a
grid at all — inert in every test so far, because no test had turned `iceGridMode` on for a live
recording — so a session recorded from now on, with a real grid affecting friction, would have replayed
against an always-fresh sheet and silently diverged the moment the grid did anything. Fixed by giving
`ReplayPlayer` its own `IceGrid`, sized from the initial params and never serialized, for the same
reason the grid is never part of the wire format anywhere else: it is fully determined by the same
recorded inputs that determine everything. `games/ice-run-godot/tests/engine.test.mjs` then caught the
mirror image of the same bug one layer up: its own reference `step()` call, kept deliberately separate
from `IceEngine`'s to prove the bridge runs "the exact Ice Lab solver," had no grid of its own either,
so it silently disagreed with `engine.mjs`'s now-live one. Both fixed the same way: give the reference
path its own grid, matching what the live path actually does.

**A naming collision, caught before it shipped.** `game/index.html` already had a `FLOW` bar
(`playground.flow`, the free-skate speed/style meter) — an unrelated, pre-existing mechanic. The new
bible-§2.6 flow scalar reads in the HUD as **EDGE** instead (`#edge-fill`/`#edge-label`, "clean,
unskidded edges build it"), its own colour, directly below the original FLOW bar rather than replacing
or renaming it. Stamina reads as `Wind NN% · Legs NN%`; hype as `Hype NN%` plus a streak count once one
is running. All four hide in career/choreography mode, the same as the pre-existing FLOW bar, keeping
that panel to routine progress only.

**Verified in the actual game**, not just in tests: built, served, and driven in headless Chromium —
pushing to speed then holding a steady carve took EDGE from 0 to 97% with Wind and Legs barely moving
(carving is cheap), no console errors, both bars legible and visually distinct on screen.

### Hype and flow reach career scoring

Live in play is not yet the same as live in career: hype and flow could raise EDGE and change how a
skater controls, but a career event's medal only ever counted falls. `game/career.ts`'s `Choreography`
now averages `s.hype` and `s.flow` over every sampled tick of a routine — including fallen ones, so a
fall drags the mean down rather than being ignored — and `CareerState.award` adds up to
`HYPE_FLOW_BONUS_MAX` (75) XP for each at a mean of 1.0, on top of a medal's own 150. The bonus rides
the same anti-farming gate the medal XP already had: it pays only alongside a genuine medal
improvement, so replaying an already-earned gold for the bonus alone earns nothing, at any hype or flow.

## A spin's level — two features out of ten

`docs/level-features.md` specifies how a spin or step sequence earns its ISU level, 1 to 4 (or B),
from **declared** features (an authored asset says a position, entry or exit is difficult; the
simulation only verifies it was attained and held) and **observed** ones (computed purely from
physics). `sim/score.ts` had never scored a spin at all — only jumps. `sim/spinLevel.ts` closes part
of that gap, and is explicit in its own header about the part it does not.

**Every declared feature is out of reach by construction.** This rig has no pose or joint-angle
representation — design-bible.md §3.1 is explicit that the sim is a reduced-order model, animation
reads it — and a spin's position is exactly three values (`SPIN_POSITION`: upright, sit, camel), not a
catalogue of named variations with a reference pose to check a skater's own joints against.

**Five of the seven observed features need a mechanic this rig does not have either.**
`change_foot_by_jump`, `difficult_change_of_foot` and `all_three_positions_second_foot` all need a
combination spin with a foot change mid-element — `spinStart` sets the spinning foot once and
`spinTick` never reassigns it. `jump_within_spin` needs a small jump mid-spin that resumes spinning,
which the jump and spin systems do not compose into. `both_directions` needs reversing rotation
direction mid-spin; `Sp.dir` is set once at entry and never reassigned — there is no input that flips
it. `change_of_edge` is not merely unbuilt: in this model a spin's blade tilt is `-Sp.dir * SPIN_EDGE`,
so edge sign **is** rotation direction here, not an independent quantity — scoring it apart from
`both_directions` would double-count the same event.

**That leaves two:** `increase_of_speed` (the ratio of peak to trough angular velocity within one
held position, at least 1.30× over at least 2 revolutions — "emerges naturally from the player pulling
in: ω = L / I", the doc's own words, and the same physics `test/spin.test.ts`'s "a camel is slow and
an upright fast" case already measures) and `eight_revolutions_no_change` (a single unbroken segment
of 8 or more revolutions). Both are real ISU features, read straight from `data/spin-features.json`
(never hardcoded — the same "scoring is data" convention `sim/score.ts` already follows) rather than
authored numbers, so a rules update to that file moves the thresholds without a code change.

`sim/moves.ts`'s own `SpinState` only keeps the **current** segment's stats, overwritten the moment
position changes — enough for its own purposes, not enough to score a whole spin afterward.
`SpinLevelTracker` rebuilds the doc's own "list of segments" (§2) as a small external history, sampled
once per tick by the caller; `scoreSpinLevel` is then pure, the same segment list always scoring the
same result. Wired into `game/main.ts`: every tick of a live spin is sampled, and the moment it ends —
released or fallen, either way `s.move` leaves `MOVE.Spin` — the level is scored and shown
(`Last spin: level N`). Verified in the actual game via headless Chromium: a real held spin, entered
with the arms out and pulled in mid-hold, scored **level 2** — both features, for real, from physics
alone.

**A level built from two of ten features tops out at 2, never 4 — an honest ceiling, not a bug.**
Levels 3 and 4 need the combination-spin and direction-reversal mechanics above; `sim/spinLevel.ts` is
not a substitute for building those, and its own header says so. Not wired into
`games/ice-run-godot/bridge/engine.mjs`: unlike the ice grid, this is a pure read-only analysis over
already-recorded state — it never touches `SkaterState` or `Params` — so there is no replay-determinism
risk in leaving it browser-only for now.

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

The two historical `/8` branches had different schemas. The merged `/9` reader
rejects both; use `23e3e49` for game-branch clips or `a1b4278` for fidelity-branch
clips. Do not relabel saved clips. The pinned native `/5` oracle is unchanged.

`ice-lab-f64/9` (the current contract; the history is in `sim/replay.ts`) is a JavaScript regression contract. CRC32 covers every state
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
entries, turns beyond the three-turn, mohawk, bracket and twizzle (rockers,
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

## Licence

Ice Lab is **Apache-2.0** — see [`LICENSE`](LICENSE). That covers everything under
`tools/`, tuned constants included, on the same terms as `src/` and `data/`. The
design bible in `docs/` is licensed separately; the reasoning is in
[the root README](../../README.md#licensing) and
[D7](../../docs/open-decisions.md#d7--licence-for-tools).
