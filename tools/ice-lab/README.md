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
node --test test/*.test.ts     # 131 tests
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

---

## Controls, and the three schemes

Keyboard: **A/D** lean, **W/S** rocker fore-aft, **Shift** knee, **Q/E** weight,
**Space** stroke, **X** brake, **R** reset, **P** pause, **T** preset, **M** pad
scheme. Jumps, when on: **J** cycles off / hop / full, **C** arms out, **F** toe
pick.

Pad: **left stick** lean, **RT** knee, **A** stroke, **LT** brake, **LB/RB**
weight, **Y** reset, **X** preset, **Back** scheme; for jumps, **right stick**
carriage, **B** toe pick, **D-pad ↑** jump mode. A browser hides a gamepad
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

`ice-lab-f64/4` is a JavaScript regression contract. CRC32 covers every state
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

Spins, turns and three-turns (a skater gets backward by a waltz jump or by
starting backward), falls beyond their trigger, animation, networking, stamina,
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
