# Edgework — Design & Technical Bible

**v1.0 · The ice remembers every line.**

A physics-first figure skating simulation in which every metre of travel is the consequence
of lean, pressure and edge choice — and every edge you take is written permanently into the
ice beneath you.

| | |
| --- | --- |
| **Genre** | Sports simulation / creative sandbox |
| **Engine** | Unreal Engine 5.4+ — [decided](open-decisions.md#d2--engine) |
| **Platforms** | PC, PS5, Xbox Series, Switch 2 |
| **Team peak** | 40 FTE |
| **Schedule** | 30 months to launch |
| **Sim rate** | 120 Hz fixed, deterministic |

> **Rendered version:** [docs/web/index.html](web/index.html) — the same document with
> diagrams, published at the artifact link in the root README.
>
> **Reference code** lives in [`src/reference/`](../src/reference/) and
> **scoring data** in [`data/`](../data/), rather than being duplicated here.

---

## Table of contents

1. [Concept & Vision](#01--concept--vision)
2. [Core Gameplay Mechanics](#02--core-gameplay-mechanics)
3. [Physics Simulation & Animation](#03--physics-simulation--animation)
4. [Art Direction & Visual Design](#04--art-direction--visual-design)
5. [Audio Design](#05--audio-design)
6. [Technical Architecture](#06--technical-architecture)
7. [AI Opponents, Judges & Crowd](#07--ai-opponents-judges--crowd)
8. [Development Roadmap & Risk](#08--development-roadmap--risk)
9. [Advanced Features & Innovation](#09--advanced-features--innovation)
10. [Reference Code](#10--reference-code)

---

# 01 · Concept & Vision

## The core fantasy

Most sports games sell you *power*. This one sells *balance*. You are not pressing buttons
that make a skater skate; you are the skater's balance, and the skating is what falls out of
it. The felt experience the whole game is built to deliver is a single one: **the moment you
drop onto a deep outside edge at speed and the ice takes your weight.** Everything else — the
jumps, the scores, the costumes — is scaffolding around that sensation.

Three pillars govern every decision below. If a feature does not serve one of them, it does
not ship.

| Pillar | Statement |
| --- | --- |
| **1 · Edges, not buttons** | There is no jump button and no turn button. Analog lean and analog knee pressure drive a real contact model; elements emerge from physical state. The control scheme *is* the domain model. |
| **2 · Programs are authored** | You do not pick a routine from a list. You compose one — to your own music, on your own ice — and then you have to go and skate it. |
| **3 · The ice keeps the record** | Blade tracings accumulate on the surface, alter its friction, and are readable afterwards as a drawing of everything you did. Evidence, not a scoreboard. |

## Unique selling points

- **Carve-first movement.** Turn radius is emergent from speed and lean via
  `tan θ = v²/(g·r)`, not a designer-tuned turn rate. Nobody has shipped this for skating.
- **Persistent ice tracings.** One system, three payoffs: a signature visual, a live friction
  model, and the scoring mechanism for the school-figures tutorial.
- **The Composer.** A choreography editor with a transition solver, sharing *choreography
  rather than audio* — which sidesteps music licensing entirely (§09).
- **Nine simulated judges.** Scores are a trimmed mean of nine opinionated humans, so the same
  run twice never scores identically. Judging feels earned rather than computed.
- **Fatigue as strategy.** Real skating awards a 1.1× bonus for jumps in the second half of a
  program. That bonus versus your own stamina curve is the game's central risk/reward
  decision, and it is lifted directly from the sport.
- **Adaptive triggers.** On DualSense, the knee-load trigger has real resistance that rises
  with compression and releases at takeoff. The most direct haptic mapping in any sports title.

## Title & positioning

**Edgework** is a real term of art: the quality and variety of a skater's edges, the thing
judges actually assess under Skating Skills. It is short, it reads as craft rather than
spectacle, and it puts the mechanic in the name.

Primary tagline: *The ice remembers every line.*
Alternate for trailers and store copy: *Grace is physics, held.*

## Audience & platforms

| Segment | Size & motivation | What serves them |
| --- | --- | --- |
| **Mastery / sim players** | Primary. The *Trials* / *Skate* / soulslike audience — people who want a hard, legible, physical skill. | Simulation assist tier, leaderboards, deterministic ghosts, tight execution windows. |
| **Figure skating fandom** | Large, intensely engaged, and genuinely underserved — no serious title since the licensed tie-ins of the late 2000s. Skews female, strongest in Japan, Korea, North America and Europe. | Authentic ISU scoring, real element vocabulary, career mode, costume depth, Kiss & Cry. |
| **Creative / expressive players** | Tertiary but the retention engine. The photo-mode, Sims, and Dreams crowd. | The Composer, Free Skate, Gala mode, costume design, shareable tracings. |

| Platform | Status | Rationale |
| --- | --- | --- |
| **PC (Steam)** | Lead | Lead SKU. Mod support for costumes and music. Gamepad strongly recommended — analog triggers are load-bearing. |
| **PS5** | Lead | Adaptive triggers are close to a bespoke feature for this game. Haptics carry blade texture. |
| **Xbox Series X\|S** | Lead | Series S needs a scoped crowd and reflection budget (§06). |
| **Switch 2** | Post-launch | +4 months. Halve crowd, bake GI, cut planar reflections to SSR, 1080p30/60. |
| **VR** | Free DLC, year 1 | **Not a mode of the main game.** Locomotion on a carve at 9 m/s is a nausea generator and you have no legs. What *does* work: seated/standing *Ice Level* spectating, and a hand-tracked spin & carriage studio where your arms drive the moment of inertia directly. Ship that, nothing more. |
| **Mobile** | Not planned | The control scheme is analog-continuous in three axes. There is no honest touch mapping, and a compromised one would undercut Pillar 1. |

## Game modes

| Mode | What it is | Session | Priority |
| --- | --- | --- | --- |
| **The Patch** | Tutorial, framed as compulsory school figures — a real, judged discipline until 1990. You trace a figure eight and are scored on the tracing itself. Teaches edges, lobes and control before it teaches a single element. | 3–8 min | Ship |
| **The Season (Career)** | 4–6 seasons: club → regionals → nationals → Grand Prix → Worlds/Olympics. Between events you allocate training weeks, choose music and costume, and plan program layouts. Coach relationship, injury and form arcs. Rivals progress independently. | 20–45 min/event | Ship |
| **Competition** | Single event, any skater, any level, any rink. The quick-play entry point. | 8–15 min | Ship |
| **Free Skate** | No judging, no clock, no HUD. An empty rink at dawn and your music. The retention mode and the emotional centre of the game — this is what people will post. | Open | Ship |
| **The Composer** | Choreography editor over a music beat grid (§09). | Open | Ship |
| **Gala / Exhibition** | No rules, no required elements, props and player-authored lighting cues. Where the fandom lives. | 4 min | Ship |
| **Warm-Up Group** | Six players, six minutes, one sheet of ice, no judging. The real warm-up group turned into a social lobby. Low stakes, cheap netcode, high charm. | 6 min | Ship |
| **Live Events** | Scheduled asynchronous competitions with a real draw order, shared leaderboards and server-validated runs. | 15 min | Ship |
| **Pairs & Ice Dance** | Two-player coupled skating: lifts, throws, twizzles in unison. Genuinely hard netcode and animation (§06). Cut from launch scope on day one. | — | Post-launch |

**Launch content scope:** 12 rinks · 2 disciplines (men's and women's singles) · 24
pre-authored skaters plus full creation · ~40 base garments across a modular costume system ·
30 commissioned score tracks + 14 fresh recordings of public-domain repertoire + 4 licensed
contemporary tracks · ~1,500 mocap clips.

**Anti-goals:**

- No combo counters, no score multipliers on screen, no "TRICK!" popups.
- No exaggerated physics. If it cannot happen on real ice it does not happen here.
- No failure shaming. Falls are ordinary in this sport; the game frames them as narrative,
  and the crowd's sympathetic silence is the punishment.
- No real-athlete or federation licensing at launch (§08 risk 9).

---

# 02 · Core Gameplay Mechanics

## 2.1 Control mapping

Two analog sticks and two analog triggers carry the whole game. The design rule: **sticks
control where the body is, triggers control how hard the legs are working.** Face buttons
only ever *request* something the physics has to permit.

| Input | Function | Detail |
| --- | --- | --- |
| **Left stick** | Lean vector | Direction = lean direction in the skater's frame; magnitude = lean angle, 0–65°. Selects *which edge* is engaged and *how deep*. The most important input in the game. |
| **Right stick** | Carriage | Upper body, arms and free-leg line. Radial magnitude = how far the mass is from the spin axis (this literally drives moment of inertia). Angle = arm/torso pose. Also used to *check* — counter-rotate the shoulders — which is how skating stops rotation. |
| **RT (analog)** | Knee pressure | 0 = straight leg, 1 = deep bend. Deep knee = more push power, more edge bite, more jump impulse, higher stamina cost. Release rate at takeoff determines vertical impulse. |
| **LT (analog)** | Free leg / toe | Tap = toe-pick strike (required for toe loop, flip, lutz, toe steps). Hold = free-leg extension for spirals and arabesques. |
| **A / ✕** | Push | Contextual: a straight stroke on a flat, a crossover on a curve. Power scales with RT at the moment of push. |
| **B / ○ + stick** | Turn | Selects from the turn matrix below. Only physically valid turns from the current edge state are offered — invalid ones grey out on the Edge Ribbon. The core teaching device. |
| **X / □** | Twizzle | Traveling rotation on one foot; hold to sustain, stick to steer. |
| **Y / △ + stick** | Spin entry | Stick at entry chooses upright / sit / camel; hold to sustain. |
| **LB / RB** | Accent | Choreographic flourish — arm sweep, head snap, épaulement. Landing one within ±80 ms of a musical accent earns Presentation credit (§2.6). |
| **D-pad** | Program | Next-element callout, assist toggle, camera cycle. |

> ### Design keystone
> **There is no jump button.** A jump is: get on the correct entry edge → compress the knee
> (RT) → release it. The release *is* the takeoff. For toe jumps you also plant the pick (LT)
> inside a 90 ms window. This single decision is what separates the game from every skating
> title that has shipped, and it is also the biggest risk in the project (§08 risk 1).

### The assist ladder

Full content is available at every tier — assists change the challenge, never the
progression. Leaderboard entries carry a visible assist factor rather than being excluded.

| Tier | Edges | Timing | Rotation | Balance | Score × |
| --- | --- | --- | --- | --- | --- |
| Show | Automatic | Prompts, 3× windows | Automatic check-out | Fully assisted | 0.60 |
| Club | Snaps to nearest valid edge | Prompts, 2× windows | Assisted | 80% nulled | 0.78 |
| Novice | Manual, forgiving entry | Subtle HUD cue | Manual | 40% nulled | 0.92 |
| Senior | Manual | None | Manual | None | 1.00 |
| Patch | Manual + ice and blade variance | None, no HUD | Manual | None | 1.06 |

## 2.2 Skating movement — the physical model

Two facts about ice skating drive the entire model, and both are counter-intuitive to anyone
who has not skated:

1. **You cannot push backwards.** A blade offers almost no resistance along its length
   (μ ≈ 0.006 — roughly a hundredth of a running shoe on tarmac) and enormous resistance
   across it. All propulsion comes from pushing *sideways* against an engaged edge.
2. **You do not steer, you lean.** A tilted blade traces an arc because of its rocker — the
   gentle front-to-back curvature of the blade's bottom. Turn radius is a consequence of lean
   angle and speed, never a direct input.

### The three radii

The solver computes two turn radii each tick and reconciles them. The difference between them
is the balance problem the player is actually solving.

**Geometric radius — the radius the blade *wants* to cut:**

```
r_geo = R_rocker / sin θ
```

A blade with rocker radius `R_rocker` (≈ 2.05 m on a figure blade) tilted θ from vertical
traces an arc of this radius on the ice. At θ = 0 the blade is upright and the arc is a
straight line; as θ grows the arc tightens. The player's fore/aft weight also matters: the
front third of the blade has a much tighter rocker, which is why turns happen "on the rocker."

**Dynamic radius — the radius that *balances* at this speed:**

```
r_dyn = v² / (g · tan θ)
```

Faster means you can lean further; leaning further at low speed means falling over.

**The edge test:**

```
F_lat  = m·v² / r_geo
F_bite = μ_edge(θ, sharpness, ice) · N
```

The blade must generate the lateral force to hold the geometric arc. If it cannot, the edge
lets go: the arc widens, speed bleeds off through `μ_skid ≈ 0.35`, and snow sprays. μ_edge
rises steeply with θ up to about 60° and then collapses — the blade washes out. Shipped as a
tuning curve asset, not a formula.

> A hollow-ground blade has **two** edges, not one. Which edge is engaged, on which foot,
> travelling forwards or backwards, gives the eight fundamental edges — the alphabet of the
> entire sport.

### Movement vocabulary

| Action | Input | Model |
| --- | --- | --- |
| **Stroke** | A on a flat | Lateral impulse along the pushing blade's normal. `J = m·k·knee·stamina·dt`. Two-beat alternation. |
| **Crossover** | A while carving | The propulsion engine on curves and the most common thing you do. Two pushes per cycle — the outside foot pushes under, the inside foot pushes out. Each push has a beat window; hitting it gives full impulse, missing it gives 45% and an audible chop. |
| **Glide** | Nothing | Deceleration ≈ 0.06–0.14 m/s² from blade friction alone, plus quadratic air drag. At 8 m/s drag and friction are comparable — this is why speed feels expensive to build and cheap to keep. |
| **Spiral** | LT held on an edge | Free leg above hip height. Slows you, costs Wind, but regenerates Legs and reads as PCS-bearing choreography. Skaters really do build these in as rest. |
| **Snowplow stop** | Both triggers, flat | Low deceleration, wide spray, easiest. |
| **T-stop** | LT drag | Drag the free blade perpendicular behind. Controlled, quiet, moderate. |
| **Hockey stop** | Sharp lean across travel | Both blades skid perpendicular. Fastest stop, biggest spray, most ice damage — visible in the tracing for the rest of the program. |

Working speed range: 5–7 m/s cruising, 8–10 m/s entering a big jump. The rink is the ISU
standard 60 × 30 m. These numbers are the tuning anchor for animation, camera and audio alike.

### Balance

A 2D **balance error** vector (fore/aft, lateral) accumulates from the torque mismatch between
the geometric and dynamic radii, from landing impacts, from mistimed pushes, and from a
fatigue-scaled noise term. The right stick and the knee null it. Cross 0.55 and the skater
visibly fights; cross 0.85 and it becomes a stumble; fail to recover and it becomes a fall.
This one scalar is the connective tissue between physics, animation and drama.

## 2.3 Turns and transitions

Skating turns are classified by three questions: does the foot change, does the edge change,
and does the body rotate *with* the curve or *against* it. That taxonomy is the whole input
scheme — hold `B` and the left stick answers questions two and three.

| Turn | Foot | Edge | Rotation | Leaves | Difficulty |
| --- | --- | --- | --- | --- | --- |
| Three turn | Same | Changes | Into the curve | A "3" on the ice | ★ |
| Mohawk | Changes | Same character | Into | Two arcs meeting | ★★ |
| Bracket | Same | Changes | *Against* the curve | A "}" cusp | ★★★ |
| Choctaw | Changes | Changes | Either | Cusp across the lobe | ★★★ |
| Rocker | Same | Same | Into, curve reverses | Lobe change | ★★★ |
| Loop turn | Same | Same | Into | A small closed loop | ★★★ |
| Counter | Same | Same | *Against*, curve reverses | Lobe change with cusp | ★★★★ |
| Twizzle | Same | Travels | Continuous multi-rev | A traveling coil | ★★★★ |

The Edge Ribbon shows the four turns currently available from your edge state and greys the
rest. A player learns the taxonomy without a single tutorial screen, because the illegal
options simply are not there. Turns cost speed proportional to how much they fight the current
arc — counters and brackets are expensive, which is exactly why they score higher.

## 2.4 The jump system

Six jumps exist in figure skating. They are distinguished entirely by *how you leave the ice*:
which foot, which edge, forwards or backwards, and whether the free foot's toe pick assists.
All six land identically — right back outside edge, gliding backwards.

Table assumes a counter-clockwise rotator (about 85% of skaters); the player picks a rotation
direction at creation and it mirrors everything. Machine-readable version:
[`data/jump-definitions.csv`](../data/jump-definitions.csv).

| Jump | Code | Takeoff | Toe pick | Landing | Rel. diff. | Signature error |
| --- | --- | --- | --- | --- | --- | --- |
| Toe loop | `T` | Right back outside | Yes, left toe | RBO | 1.00 | Pre-rotation on the pick |
| Salchow | `S` | Left back inside | No — edge jump | RBO | 1.02 | Toe-assisted takeoff (illegal help) |
| Loop | `Lo` | Right back outside | No | RBO | 1.17 | Takes off and lands on the same foot and edge — no help at all |
| Flip | `F` | Left back inside | Yes, right toe | RBO | 1.26 | **Lip** — drifting to an outside edge |
| Lutz | `Lz` | Left back **outside** | Yes, right toe | RBO | 1.40 | **Flutz** — drifting to an inside edge. Counter-rotated: you curve one way and rotate the other. |
| Axel | `A` | Left **forward** outside | No | RBO | 1.90 | The only forward takeoff, so it carries an extra half rotation. A "triple axel" is 3½ revolutions. |

Relative difficulty is the ratio of triple base values against 3T. It falls out of the ISU
Scale of Values and matches the sport's own ordering exactly.

> ### Why combinations work the way they do
> A jump *combination* requires the second jump to take off from the landing foot and edge of
> the first. Since every jump lands RBO, only the two jumps that take off from RBO can follow:
> the toe loop and the loop. That is why virtually every combination in the sport ends in
> `+3T` or `+3Lo`. The player discovers this from the physics rather than a rules screen.
> A jump *sequence* (`SEQ`) links jumps by steps or turns instead and scores 80% of the sum.

### The five-beat jump loop

```
APPROACH ──────────────── LOAD ── TAKEOFF ── AIR ─────────────────── CHECK ── EXIT
1.5–3.0 s                 0.30 s   0.12 s    0.55–0.75 s             0.20 s
build speed,                       │         ballistic: L is fixed,
hold entry edge                    │         only I is controllable
                                   │
                   everything after this instant is already decided
```

1. **Approach (1.5–3.0 s).** Build speed, arrive on the correct entry edge. Land on the wrong
   edge for a lutz and the technical panel calls `e` before you have even left the ice.
2. **Load (≈0.30 s).** Pull RT into the compression window. Depth sets impulse; duration sets
   quality. Hold too long and the edge rotates under you — **pre-rotation**, a real and
   heavily penalised cheat.
3. **Takeoff (≈0.12 s).** Release RT. Toe jumps also need the LT pick strike within 90 ms. A
   right-stick flick sets the angular impulse. This instant fixes `v_y`, `t_air` and `L`
   permanently.
4. **Air (0.55–0.75 s).** Pull the right stick to centre to draw arms and free leg to the axis.
   Since `L = Iω` is conserved, halving I doubles ω. You must accumulate the revolutions
   before the ice arrives.
5. **Check-out & landing (≈0.20 s).** Open the carriage at the right rotational phase to kill
   the spin, present the landing edge with the left stick, and absorb with RT. Open early and
   you **pop** the jump; open late and you over-rotate into a step-out.

```
t_air       = 2·v_y / g
ω_required  = 2πn / t_air
ω           = L / I(pose)
```

A clean triple: v_y ≈ 2.94 m/s, apex 0.44 m, air time 0.60 s, so 3 revolutions demand
5.0 rev/s. A quad needs about 5.9 rev/s in 0.68 s. Moment of inertia about the vertical axis
runs from roughly 4.0 kg·m² open to 0.95 kg·m² fully drawn in — a factor of four, which is
exactly the factor by which a skater's rotation visibly accelerates. Fatigue raises the
achievable floor, so a tired skater physically cannot rotate as fast. **That is the whole
stamina system in one line of maths.**

### How the technical panel calls a jump

Thresholds implemented in [`src/reference/JumpResolver.cpp`](../src/reference/JumpResolver.cpp);
data in [`data/calls-and-deductions.csv`](../data/calls-and-deductions.csv).

| Call | Meaning | Trigger in sim | Effect |
| --- | --- | --- | --- |
| `q` | Quarter short | Rotation short by ⅛–¼ turn | Full base value, mandatory GOE reduction |
| `<` | Under-rotated | Short by ¼–½ turn | Base value × 0.80 |
| `<<` | Downgraded | Short by more than ½ turn | Scored as the jump with one fewer revolution |
| `!` | Unclear edge | Edge error 0.25–0.55 | GOE reduction |
| `e` | Wrong edge | Edge error > 0.55 (flutz / lip) | Reduced base value band and heavy GOE penalty |
| `*` | Invalid | Element outside the well-balanced program requirements | No value |

Also modelled: two-foot landings, step-outs, hand-down, falls, and popping (opening early so
a planned triple becomes a single). Each is a distinct state in the resolver rather than a
probability roll.

## 2.5 The spin system

Spins are the other half of the sport and mechanically the opposite of jumps: instead of one
explosive decision followed by ballistics, they are a continuous negotiation between speed,
position and centering, under a slowly draining angular momentum.

| Family | Code | Position | Variations |
| --- | --- | --- | --- |
| Upright | `USp` | Body vertical over the spinning foot | Layback (`LSp`, back arched, head dropped), Biellmann (free foot pulled overhead), crossfoot |
| Sit | `SSp` | Skating thigh at or below horizontal | Pancake, broken leg, cannonball, tuck behind |
| Camel | `CSp` | Free leg extended back at hip height, torso horizontal — an arabesque, spinning | Catch-foot, donut, layover |
| Combination | `CoSp` / `CCoSp` | Two or more basic positions, optionally with a change of foot | `CCoSp` is the change-foot version |
| Flying entry | `FCSp` / `FSSp` | Airborne entry landing directly into the position | Flying camel, flying sit, death drop, butterfly |

**Mechanics:**

- **Entry.** Hook a tight back-inside edge, then *check* the upper body with the right stick.
  The counter-rotation transfers the entry curve's angular momentum into rotation about a
  vertical axis. Entry speed and check timing set the initial `L`; you never get more.
- **Centering.** A real spin stays on one spot; a bad one **travels**, scrawling across the
  ice. Model a 2D centering error driven by axis tilt and fore/aft pressure imbalance, nulled
  by small left-stick corrections. The tracing system draws the result live — a tight coil or
  an embarrassing scribble — which makes it the most legible feedback in the game.
- **Speed.** `ω = L / I(pose)`. Right-stick radial magnitude sets I directly. Blade friction
  bleeds L at a rate that rises with contact patch and centering error, so a wobbling spin
  dies fast.
- **Revolutions.** Eight minimum for a basic spin; more for combinations. A live counter
  appears only in the Novice tier and below.
- **Levels 1–4** come from *features*, not revolutions: a difficult variation in each basic
  position, change of foot, difficult entry, a clear increase of speed, eight revolutions in
  one position without change, difficult exit. The HUD shows a live feature checklist.
  *(Feature enumeration is a known gap — see [open-decisions.md](open-decisions.md).)*
- **Exit.** A check-out into a controlled glide. Fumbling it costs GOE and flow.

The tension: pulling tighter buys revolutions fast but makes centering harder and drains Legs.
The skill ceiling is holding a hard position, dead centred, while ω decays and your quadriceps
burn.

## 2.6 Step sequences, transitions and flow

A step sequence (`StSq`) must cover the ice surface and use turns in both rotational
directions; a choreographic sequence (`ChSq`) has a fixed base value and is scored purely on
GOE. Between the listed elements sits everything else — the transitions — which are a third of
the Program Component Score and, in most skating games, completely absent.

### The flow scalar

A single value in [0,1], integrated continuously:

| Rises with | Falls with |
| --- | --- |
| Clean unskidded edges · deep lean held through an arc · alternating lobes · turns executed on the beat grid · continuous motion without pauses · covering fresh ice | Skids and chops · skating on flat feet · stopping or coasting straight · repeated lobes in the same direction · dead air between elements · re-crossing damaged ice |

Flow feeds four systems: Skating Skills and Composition in PCS; stamina efficiency (high flow
means you carry speed and push less, so it is literally cheaper to skate well); a subtle bloom
and depth-of-field response in the camera; and the crowd's willingness to start clapping along.

### The rhythm layer

Every track carries a beat grid: beats, downbeats, phrase boundaries, accent markers, and
swell/silence regions. Executing an accent, a turn, or a jump landing within ±80 ms of a marked
accent earns **musical credit**, which feeds Presentation and adds a small GOE bonus to the
element it lands on. Phrase-aware: a big jump landing on a phrase climax is worth roughly three
times an arbitrary beat.

> **Guardrail: this is a modifier, never a gate.** Missing the beat costs you a few tenths; it
> never fails an element. The instant timing windows become pass/fail, Edgework stops being a
> skating game and becomes a rhythm game with skating art. Playtest this boundary specifically.

## 2.7 Scoring — a faithful ISU implementation

The real system is intimidating from outside and quite simple once decomposed. Every score is:

```
Total Segment Score = TES + PCS − Deductions
```

**TES** (Technical Element Score) is the sum of what you did. **PCS** (Program Component Score)
is how well you skated overall. Deductions are falls, time violations and rule breaches.

### Technical Element Score

```
Element = BV × (1.10 if bonus-eligible & second half) + GOE_avg × step
```

Nine judges each award an integer GOE from −5 to +5. The highest and lowest are discarded and
the remaining seven averaged. For jumps, one GOE step is worth 10% of base value; spins and
step sequences use a fixed increment per level. Under the current rules only the *last* jump
element started in the second half of a free skate receives the 1.1× multiplier.

Base values: [`data/scale-of-values.csv`](../data/scale-of-values.csv) and
[`data/spin-step-values.csv`](../data/spin-step-values.csv).

| Jump | Single | Double | Triple | Quad |
| --- | --- | --- | --- | --- |
| Toe loop | 0.40 | 1.30 | 4.20 | 9.50 |
| Salchow | 0.40 | 1.30 | 4.30 | 9.70 |
| Loop | 0.50 | 1.70 | 4.90 | 10.50 |
| Flip | 0.50 | 1.80 | 5.30 | 11.00 |
| Lutz | 0.60 | 2.10 | 5.90 | 11.50 |
| Axel | 1.10 | 3.30 | 8.00 | 12.50 |

> The axel column is offset by a half rotation — a "single" axel is 1½ revolutions.
> **Ship this as a DataTable, never as code:** the ISU revises the SOV most seasons, and a live
> game needs to follow. Verify against the current published SOV before content lock.

### Program Component Score

Since the 2022–23 season there are three components rather than five. Each judge scores each
component 0.25–10.00 in quarter-point steps; the panel is trimmed the same way, then multiplied
by a factor that scales short and free programs to comparable magnitudes.

| Component | What it measures | Driven in-game by |
| --- | --- | --- |
| **Composition** | Pattern, purposeful use of the whole ice sheet, structure, phrasing | Ice-coverage map from the tracing buffer, lobe variety, element distribution, Composer layout |
| **Presentation** | Projection, carriage, musicality, variety, engagement | Musical credit accumulation, accent usage, carriage-stick activity, gaze behaviour, posture under fatigue |
| **Skating Skills** | Edge quality, flow, power, glide, multi-directional skating | Mean flow, mean lean depth, skid ratio, speed retained through transitions, both-direction turn usage |

Segment factors: short program — men 1.67, women 1.33; free skate — men 3.33, women 2.67.
See [`data/segment-rules.csv`](../data/segment-rules.csv). Verify against current regulations.

### Deductions and program requirements

- Fall: −1.00 for each of the first two, −2.00 for the third and fourth, −3.00 for the fifth
  onward.
- Time violation: −1.00 per five seconds over or under the permitted duration.
- Costume or prop violation: −1.00. Illegal element: −2.00. Interruption: −1.00 rising with
  delay.

| Segment | Duration | Jumps | Spins | Steps |
| --- | --- | --- | --- | --- |
| Short program | 2:40 ± 10 s | 3 elements: one axel-type, one solo, one combination | 3, all different types | 1 step sequence |
| Free skate (senior) | 4:00 ± 10 s | 7 elements, max 3 of them combinations or sequences, one of which may be three jumps | 3, different types, one a combination spin | 1 step + 1 choreographic sequence |

The **Zayak rule** also applies: no triple or quad may be attempted more than twice, and any
jump repeated must appear in a combination or sequence. A violated repeat is marked `*` and
scores zero — a real and frequently decisive mistake, and one the Composer warns about while
you plan.

## 2.8 Stamina and fatigue

Two pools, because real exertion has two mechanisms and they recover differently.

| Pool | Drains from | Recovers | Feel |
| --- | --- | --- | --- |
| **Wind** (aerobic) | Elapsed time and speed², continuously. Over a four-minute free skate it declines steadily and never fully recovers mid-program. | Only during genuinely low-effort gliding, and slowly | Breath in the mix, vapour in cold rinks, chest rise in the animation |
| **Legs** (anaerobic) | Jumps (large), low spin positions, deep edges, every crossover push | Partially during glide, but gated by Wind — once Wind is low, Legs stop coming back | Posture collapse, slower pull-in, jump height loss |

| Effect at low stamina | Mechanism | Range |
| --- | --- | --- |
| Jump height falls | Vertical impulse multiplier | 1.00 → 0.82 |
| Rotation slows | Minimum achievable moment of inertia rises — you cannot pull in as tight | 0.95 → 1.55 kg·m² |
| Balance noise grows | Perturbation amplitude on the balance error | ×1.0 → ×2.4 |
| Landing window narrows | Check-out tolerance | −25% |
| Edge bite drops | Maximum sustainable lean | −8° |
| Posture degrades | Additive animation layer weighted by (1 − Legs) | Visible tell, no number |

Management is where the strategy lives: **front-load** the hard jumps and skate them fresh, or
**back-load** them into the second half to claim the 1.1× bonus and gamble on your
conditioning. Build a spiral or an ina bauer in as a breathing bar — which is exactly what real
choreographers do. Skate with high flow so you push less. And in career, train the pools
upward. The stamina system is not a resource bar; it is the reason program design is a game.

---

# 03 · Physics Simulation & Animation

## 3.1 The character model: three layers, one truth

> ### Do not ragdoll a skater
> The instinct to simulate a figure skater as an articulated rigid body with joint constraints
> is the single most expensive wrong turn available on this project. Balance on a 1.1 mm blade
> is a stiff, poorly conditioned control problem; a full-body physical controller will spend
> your entire schedule and still look drunk. Simulate a *reduced-order model* of about fifteen
> state variables, animate over it, and blend to physics only when the skater is already
> falling.

| Layer | Rate | Contents | Authority |
| --- | --- | --- | --- |
| **Sim core** | 120 Hz fixed | Centre-of-mass rigid body, lean angle and axis, per-blade contact constraints, balance error, stamina, moment of inertia. Plain structs, no engine objects. | **Authoritative.** Deterministic, recordable, replayable, server-verifiable. |
| **Animation** | Frame rate | Full skeleton via motion matching + warping, IK'd to the solved blade contact points. | Presentational. Reads sim state, never writes it. |
| **Secondary physics** | Frame rate, substepped | Rigid-body chains on arms, Chaos Cloth on skirts, strand physics on hair. | Cosmetic. Blends to full ragdoll only on a fall. |

Falls are the exception and deserve care, because they are frequent, they are dramatic, and
canned fall animations are the fastest way to make a sports game feel cheap. Use a **powered
ragdoll**: at the fall trigger, blend from animation to a physically simulated body whose joint
motors start at full strength and decay to near-zero over about 0.4 s. The body genuinely gives
way, in the direction and with the momentum it actually had. Then blend back into one of six to
eight get-up animations selected by final pose and remaining speed. Total cost: a few days, and
it will show up in every trailer.

## 3.2 The blade and the ice

- **Blade geometry.** 1.1 mm wide, hollow-ground to a radius of about ½ inch, producing two
  distinct edges. Longitudinal rocker radius 1.8–2.4 m, tighter toward the front. A toe pick at
  the front with several serrated teeth.
- **Contact.** Resolves to a single point on the rocker, parameterised by `contactS ∈ [0,1]`
  from heel to pick. Fore/aft balance moves it, and moving it changes the effective rocker
  radius, which changes the arc — this is the mechanism behind turns "on the rocker."
- **Anisotropic friction.** Longitudinal μ ≈ 0.006 on fresh, hard ice at −5.5 °C, rising toward
  0.015 on soft or chewed ice. Lateral resistance is a hard constraint up to the bite limit,
  then Coulomb sliding at μ ≈ 0.35.
- **Ice state grid.** A 2D grid over the rink at roughly 12 cm resolution storing `damage` and
  `snow`. Every blade pass writes to it; damage raises local friction and lowers bite, and snow
  accumulates in ridges at stops. Resurfaced between skaters, which is why the last skater in a
  warm-up group is genuinely at a disadvantage — as in reality.

The same grid is the tracing buffer (§04, §09). One system, two payoffs, and it means the
visual and the simulation can never disagree.

## 3.3 Animation approach

Hybrid, in strict priority order. Each technique is used only where it is genuinely the best
tool.

| Technique | Used for | Notes |
| --- | --- | --- |
| **Motion capture** | All locomotion, turns, step sequences, spin positions, element entries and exits, carriage | The base layer. Capture with **IMU suits on real ice** — an optical volume cannot cover a rink, and skating carriage cannot be faked by a stunt performer. Hire competitive skaters. Supplement with an optical volume plus a rotating harness rig for jump air phases, where IMU drift is worst and precision matters most. |
| **Motion matching** | Locomotion and transition selection | UE5 Pose Search. The space of edge × speed × curvature × knee is far too large for hand-built blend spaces. Query on velocity, signed carve radius, edge sign, lean and predicted root trajectory. |
| **Warping** | Making clips fit the solved physics | **Orientation warping** bends a straight-line stride onto the arc the solver produced; **stride warping** matches blade contact speed to ground speed and eliminates foot sliding. Without these you cannot ship — every clip would need capturing at every radius. |
| **Keyframe** | Jump takeoffs, check-outs, signature spin positions, gala flourishes | Mocap gives truth; hand animation gives *readability*. A takeoff needs to be legible in 0.12 s and captured data rarely is. |
| **Procedural** | Lean, arms, gaze, free leg, breathing, fatigue | Control Rig, layered on top of everything above. |

### The hard transition: stride into takeoff

Sports games snap here, and everyone notices. The fix is **intent broadcast**: the moment the
player begins loading the knee, the jump resolver predicts the takeoff instant (roughly 0.30 s
out) and publishes it to the animation layer. Motion matching then constrains its pose search
to candidates whose takeoff-foot plant phase aligns with that instant. The skater visibly
gathers into the jump instead of teleporting into a takeoff pose. The same mechanism handles
spin entries and step-sequence turn chains.

### Procedural layer

- **Lean.** Spine and hip counter-rotation solved from the sim's lean angle and axis.
  Critically, the upper body stays several degrees more vertical than the legs — skaters
  "stack" over an edge rather than tipping like a motorcycle. Weighting this wrong is the
  difference between elegant and comical.
- **Arms.** Spring-damper toward a pose target from the carriage stick, plus an outward
  displacement term proportional to balance error, so a skater visibly reaches for balance
  without any authored animation.
- **Gaze.** Look-at that leads the travel direction by about 0.4 s along the predicted carve,
  snapping to the judges' panel or the audience on musical accents. Gaze that leads the body is
  the single strongest cue that a character is alive rather than driven.
- **Free leg.** IK target from LT and the choreography track, with a soft constraint keeping the
  blade off the ice and the toe pointed.
- **Breathing.** Rate and depth from Wind; visible vapour in cold rinks.
- **Fatigue.** An additive pose weighted by (1 − Legs). The audience should be able to see a
  skater tiring before the stamina system tells them.

## 3.4 Animation state machine

Four layers with strict priority. Locomotion is deliberately *not* a state machine — it is a
pose search — which is why the diagram has a hole in the middle where a dozen blend states
would otherwise be. Selector implementation:
[`src/reference/SkaterAnimDriver.cpp`](../src/reference/SkaterAnimDriver.cpp).

```
 ADDITIVE  (weights only — these never cause a transition)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Fatigue(1−Legs)   Carriage(RStick)   Breath(Wind)   Accent(bumper, 0.3 s)   │
 └──────────────────────────────────────────────────────────────────────────────┘
                                    ▲ applied last, over everything below

 RECOVERY  (priority 0 — pre-empts all)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │            |balanceErr| > 0.55                |balanceErr| > 0.85            │
 │  ANY ──────────────────────────▶ Stumble ─────────────────────────▶ Fall     │
 │   ▲                                 │                                 │      │
 │   │        nulled < 0.35            │            grounded 0.4 s       ▼      │
 │   └─────────────────────────────────┴──────────── GetUp ◀───── PoweredRagdoll│
 └──────────────────────────────────────────────────────────────────────────────┘

 ELEMENT  (priority 1 — overrides locomotion while active)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  JUMP                                                                        │
 │   Approach ──RT > 0.2──▶ Load ──RT released──▶ Takeoff ──leaves ice──▶ Air    │
 │                           │                      │                      │    │
 │                    hold > 0.48 s          toe window miss       remaining rot │
 │                           ▼                      ▼               < opening    │
 │                     PreRotated ─────────────▶ (quality penalty)         ▼     │
 │                                                                     CheckOut  │
 │                                                                         │     │
 │                       Land ◀── contact ──────────────────────────────────┘    │
 │                        ├── quality > 0.34 ──▶ Exit ──▶ [locomotion]           │
 │                        ├── quality 0.18–0.34 ──▶ StepOut ──▶ [locomotion]     │
 │                        └── quality < 0.18 ──▶ [RECOVERY: Fall]                │
 │                                                                              │
 │  SPIN                                                                        │
 │   Entry(hook BI edge) ──check──▶ Hold(pos) ⇄ ChangePosition ⇄ ChangeFoot      │
 │                                     │                              │         │
 │                            ω < 1.8 rad/s or input           free foot down    │
 │                                     ▼                              ▼         │
 │                                   Exit ────────────────────▶ [locomotion]     │
 │                                                                              │
 │  STEP SEQUENCE                                                               │
 │   TurnRequest ──valid from edge state?──▶ Turn(kind) ──▶ [locomotion]         │
 │                └── invalid ──▶ (rejected, Edge Ribbon flashes)               │
 └──────────────────────────────────────────────────────────────────────────────┘

 LOCOMOTION  (priority 2 — motion matching, not a state machine)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │  Pose Search query each tick:                                                │
 │     velocity · signed carve radius · edge sign · lean · knee axis            │
 │     · 0.35 s predicted root trajectory from the solver                       │
 │  Database tags: glide / stroke / crossover / spiral / skid / stop / backward  │
 │  → returns a pose, then: OrientationWarp → StrideWarp → LeanRig → BladeIK    │
 └──────────────────────────────────────────────────────────────────────────────┘
```

## 3.5 Collision and environment interaction

- **Skater–skater.** Non-existent in competition — only one skater is ever on the ice. In the
  six-player Warm-Up Group, soft avoidance capsules plus a near-miss reaction animation, with
  genuine collision retained as a comedic event rather than being prevented.
- **Boards.** Elastic response plus a hand-on-boards recovery animation. Hitting them at speed
  triggers the fall path.
- **Boundaries.** Soft repulsion steers AI skaters; the player gets a peripheral HUD hint when
  running out of ice, because misjudging the rink is a real and unglamorous way to ruin a jump.
- **Debris.** Niagara ice chips from pick strikes and skids, with snow accumulating in visible
  ridges at stop points and feeding back into the friction grid.

---

# 04 · Art Direction & Visual Design

## 4.1 Visual style: photographic realism, theatrical lighting

**Realistic, not stylised** — but lit like a stage, not a documentary. Three arguments, in
order of weight:

1. **The beauty is already real.** Ice reflecting arena lights, spray backlit in a spotlight,
   crystals on a costume catching a key light — this sport hands you free visual spectacle that
   only exists at photographic fidelity. Stylising it means paying to throw that away.
2. **The budget maths works here and almost nowhere else.** The scene is one flat 60 × 30 m
   surface, one hero character, and a stadium of distant low-detail crowd. There is no
   streaming world, no vegetation, no vehicle fleet. Essentially the entire art and rendering
   budget concentrates on one character and one material. Realism is affordable in this game
   specifically *because* the scene is so small.
3. **Stylisation would fight the fiction.** The career mode is about judged performance under
   pressure. Cartoon proportions undercut it.

The lighting reference is not sports broadcast but *ballet photography*: high-contrast key
against a dark house, heavy rim light through suspended ice mist, shallow depth of field on
close coverage. Anti-reference: saturated extreme-sports palettes, lens flares, speed lines.

## 4.2 The ice is the hero material

More engineering goes into this one shader than into any character.

| Layer | Source | Contribution |
| --- | --- | --- |
| Base ice | Authored | Very low roughness, slight subsurface scatter, subtle internal cracking and frozen bubbles at close range |
| Painted lines | Texture per rink | Hockey markings, sponsor logos, seams — under the surface, so they read as embedded |
| Tracings | Runtime virtual texture, written by the sim | Normal and roughness perturbation from every blade pass. The signature feature (§09B) |
| Snow | Same buffer, separate channel | Accumulated shavings; scatters light, kills reflection locally, ridges at stops |
| Wetness | Time since resurface | Fresh ice is glassier; it dulls measurably over a warm-up group |

**Reflections.** Ice is a near-mirror at grazing angles, and grazing angles are exactly what a
low broadcast camera sees. Use a **planar reflection** for the ice plane — the rink is a single
perfect plane, which is the one case where planar reflection is both exact and cheap — culled to
the skater, the boards and the light fixtures, rendered at half resolution, and enabled only
when the camera sits below about 25° elevation. Lumen handles everything else. This is the
highest-value rendering decision in the project.

## 4.3 Character customisation

### Body

A morph rig spanning height 1.45–1.90 m, limb proportion, musculature, and a skating-specific
set covering turnout, back arch and shoulder line. **Body type is not cosmetic.** It feeds mass,
open and closed moment of inertia, jump impulse and stamina capacity, producing a genuine
trade-off that mirrors the sport:

| Build | Advantage | Cost |
| --- | --- | --- |
| Small, light | Lower moment of inertia — rotates faster, quads land more readily | Less power, lower Wind ceiling, shallower edges |
| Tall, long-limbed | Line and extension modifiers to Presentation and Skating Skills; more power | High moment of inertia — must pull far tighter for the same rotation speed |
| Muscular | Highest jump impulse and edge bite | Fastest Legs drain; fatigue arrives early |

### Costume

Modular: bodice, skirt or trousers, sleeve, neckline, collar, plus a layered fabric system —
base fabric (velvet, lycra, satin, mesh), overlay (lace, illusion mesh, appliqué), and **crystal
placement**. Crystals are the visual signature of the sport and no game has done them properly.

- **Crystal rendering.** Paint a density map with a brush, then GPU-instance low-poly cut gems
  from it — 2,000 to 6,000 instances at LOD0. Clearcoat plus high-specular material, with a
  screen-space sparkle pass that pulses each crystal on the alignment of the half-vector with
  each key light. LOD to a sparkle-only texture beyond a few metres.
- **Skirt.** Chaos Cloth with a spin-safe path: above roughly 4 rev/s, raise substeps and air
  drag, and above 6 rev/s swap to a procedural conical deformer driven by ω. Real cloth solvers
  explode at spin speeds; solve this in the vertical slice, not in beta (§08 risk 4).
- **Hair.** Strand-based groom with three simulation LODs and a bound "spin mode" that
  constrains root motion. Buns, slicked ponytails and braided styles are both authentic and
  cheap.
- **Boots and blades.** Boot colour and covers, lace colour, ankle support profile, blade
  finish. Blade sharpness is a career resource: sharp blades bite harder and skid less, and dull
  over a season.

## 4.4 Arenas

| Rink | Character | Light | Role |
| --- | --- | --- | --- |
| **Rideau Arena** | Worn municipal rink; hockey lines showing through, plastic seats, a vending machine | Flat greenish fluorescent | Career home; where The Patch is taught |
| **Practice Ice, 6 a.m.** | Empty, one fire door open, dust in a single shaft of light | One raking sunbeam | The emotional centre. Free Skate default. |
| **Nationals Coliseum** | Mid-size, warm wood, six thousand seats, actual atmosphere | Broadcast key + house | Career mid-game |
| **Grand Prix Hall** | Modern, LED ribbon boards, federation banners | Saturated coloured gels | International circuit |
| **Olympic Arena** | Eighteen thousand seats, rings of flags, the whole apparatus | Full broadcast rig | Career climax |
| **Kristallhalle** | Outdoor alpine ice, mountains behind, natural surface | Golden hour into blue hour, real sun | Weather affects ice hardness |
| **The Frozen Canal** | Outdoor, night, string lights, falling snow, bystanders | Warm practicals | Free Skate favourite |
| **Harbour Rink** | Winter market, city skyline, uneven ice | Mixed practical | Seasonal event venue |
| **The Old Hall** | 1930s barn, exposed timber trusses, single-glazed clerestory | Cold daylight from above | Nostalgia / photo mode |
| **Summer Camp** | Open-sided roof, hot air, soft ice, insects in the lights | Harsh daylight | Career training montage |
| **The Gala** | Dark house, theatrical moving lights, atmospheric haze | Fully player-authored cues | Exhibition and Composer showcase |
| **Studio Black** | Featureless void, one spot, infinite floor | Single controllable key | Composer workspace and marketing capture |

**Particles (Niagara, GPU).** Ice spray with spawn rate proportional to skid velocity × blade
pressure, strongly forward-scattering when backlit — this is the money shot of the entire game
and deserves a dedicated week. Plus suspended crystalline mist over the surface, breath vapour,
pick debris, and costume crystal glints.

## 4.5 Camera

### The Broadcast Director (default)

A virtual camera crew of four operators — **Hard Cam** (high, wide, always keeps the skater
framed), **Follow** (low, orbiting, medium), **Ice Cam** (ground level, spray in frame),
**Overhead** (pattern and centering) — with a director choosing between them.

| Situation | Shot | Why |
| --- | --- | --- |
| Jump approach | Cut to Follow, widen 0.8 s before takeoff | Height must be readable against a horizon |
| Jump in flight | **Hold. Never cut.** | The player needs continuous rotational reference to time the check-out. This is a hard rule, not a preference. |
| Landing | Ice Cam, slight slow-motion ramp in replays only | Spray and edge |
| Spin | Slow orbit against the rotation, or Overhead on level-4 attempts | Orbiting *with* a spin is nauseating; against it reads as speed. Overhead makes centering legible. |
| Step sequence | Medium Follow, tracking with the lobes | Footwork must be visible |
| Choreo sequence / spiral | Hard Cam wide | Pattern and use of ice |
| Program end | Push in to close, then pull to overhead revealing the full tracing | The signature closing shot of every run |

The camera never rolls with the skater during spins — dampened yaw follow with a slight lead
only. Player-selectable modes: Broadcast, Follow, **Skater's Line** (low and near-first-person,
genuinely disorienting and a cult favourite), and Free. Replays are Sequencer-driven with
automatic multi-angle cuts per element, plus a photo mode with focal length, aperture, exposure
and a time scrub.

## 4.6 UI and UX

The HUD's job during skating is to disappear. Thin strokes, no panels, no boxes, no drop
shadows.

- **The Edge Ribbon** *(always visible)* — a thin arc at the lower edge of the screen. Its
  curvature shows the current carve, its side shows inside or outside edge, its thickness shows
  lean depth, and a small marker shows knee pressure. Shape-coded so it reads peripherally
  without being looked at. The only permanent element.
- **Element callout** *(contextual)* — small type upper-left: the next planned element and its
  required entry edge. Fades out at Senior tier.
- **Flow & stamina** *(diegetic first)* — flow is a hairline that thickens and brightens; no
  bar, no number. Stamina appears only below 60%, as slight desaturation, louder breathing and
  visible posture change. The body is the gauge.
- **The Kiss & Cry** *(scene, not menu)* — scores are revealed in the Kiss & Cry with your
  coach beside you, the protocol sheet building element by element, the crowd audible through
  the wall. A beloved ritual of the sport, and the correct home for a results screen.

Menus use the visual language of real ISU protocol sheets: monospaced tabular figures, hairline
rules, generous margins, ice-white on near-black. Full remapping, colourblind-safe edge coding
by shape as well as colour, subtitle and audio-description support, and every assist tier
available from the title screen.

---

# 05 · Audio Design

## 5.1 Middleware

**Wwise.** The deciding factor is interactive music: the beat grid, phrase markers and
synchronised transitions map directly onto Wwise Music Segments and Playlist Containers, and the
game needs per-venue convolution reverb on complex aux routing. FMOD would work; pick one on day
one and do not re-litigate.

## 5.2 Music

| Source | Count | Cost | Notes |
| --- | --- | --- | --- |
| **Commissioned original score** | ~30 | Moderate | Written *for skating*: clear phrase structure, defined accent points, built-in 2:40 and 4:00 edits. Commission stems so the Gala can remix and the mix can duck instruments independently. You own it outright, forever. |
| **Fresh recordings of public-domain works** | ~14 | Moderate | **The key insight.** Swan Lake, Carmen, The Four Seasons, Moonlight Sonata, Tosca — the actual repertoire the sport is built on — are public domain *as compositions*, but every existing recording is separately copyrighted. Commission your own recordings and you own the masters outright, with no expiry and no territory problems. |
| **Licensed contemporary** | 4 | High | Sync + master licensing for marketing punch. **Licences expire.** Architect so that removing a track cannot break a saved program — every program stores a fallback score reference. |
| **Player's own music** | Unlimited | Zero | Local analysis only; the audio never leaves the device. |

> ### The licensing architecture that makes UGC possible
> Because imported audio can never be transmitted, **share the choreography, not the audio.** A
> shared program is a list of elements and accents anchored to a normalised timeline plus an
> acoustic fingerprint of the source track. If the recipient owns the same track, it syncs
> perfectly. If not, it plays against the nearest-tempo commissioned score, or a metronome. This
> single decision converts music from the project's largest legal liability into a non-issue,
> and it is what makes the Composer shippable at all.

**Beat grids** are authored by hand for shipped tracks — beats, downbeats, phrase boundaries,
accent markers, swell and silence regions. For imported tracks, run on-device onset detection and
tempo estimation (spectral flux plus a tempogram is entirely sufficient), then let the player
correct the grid by hand in the Composer. Correcting a beat grid turns out to be quietly
satisfying.

## 5.3 Sound effects — the blade is the lead instrument

Everything the player needs to know about edge quality should be audible with the screen off.
This is the most important sound design goal on the project.

| Layer | Behaviour | Drives |
| --- | --- | --- |
| **Glide bed** | Filtered noise plus a resonant band. Centre frequency tracks speed; gain tracks blade pressure. Two independent instances, one per foot. | Speed awareness |
| **Edge tone** | A pitched, singing partial that emerges above roughly 25° of lean and rises in pitch with depth. Deep edges genuinely sing on good ice. **The player's primary feedback channel for edge quality** — mix it prominently. | Edge depth and cleanliness |
| **Skid** | Broadband noise burst, gain proportional to lateral slip velocity. Ugly on purpose. | Failure feedback |
| **Toe pick** | Sharp transient: pick strike plus ice fracture, eight-way round robin, pitch-varied by ice hardness. | Toe jump timing |
| **Landing** | Two-part — the blade's "chk" then body absorption. A *clean* landing is markedly quieter and purer than a scraped one, so the game teaches quality through timbre rather than a score popup. | Landing quality |
| **Takeoff** | Cloth rush, sharp exhale, and a low sub swell that resolves at apex. | Drama |
| **Breath** | Rate and depth from Wind. Becomes conspicuous in the last minute of a free skate. | Fatigue |

## 5.4 Crowd and arena

- **Space.** Per-venue convolution impulse response. The *hush* before a program starts matters
  as much as the noise — Rideau Arena's flat slap and the Olympic Arena's four-second tail should
  be unmistakably different rooms.
- **Arena state machine.** Hush → Building → Roar → Ovation → the specific, awful silence after a
  fall. Crowd goes quiet in the 1.2 s before a big jump; this anticipation window is the most
  effective tension device available and costs nothing.
- **Clap-along.** When flow and musical credit are both high during a step sequence, the crowd
  begins clapping on the beat grid — exactly as real audiences do. It is earned, it is diegetic,
  and it is the best possible reward for skating well.
- **Home bias.** Venue-specific crowd warmth in career, audible before it is scoreable.

## 5.5 The mix

One signature move: **interiority during a jump.** From takeoff to landing, duck music and crowd
by 9 dB, high-pass the room, and bring cloth, breath and blade to the front. For three-quarters
of a second the player is inside the skater's head. At landing everything returns 2 dB hot and
the crowd lands on top. Used sparingly — only on triples and above — it will be the thing people
describe when they describe the game.

---

# 06 · Technical Architecture

## 6.1 Engine recommendation: Unreal Engine 5.4+

| Requirement | Unreal 5 | Unity 6 |
| --- | --- | --- |
| Hero character fidelity | MetaHuman gives production-grade bodies, faces and grooms on day one — roughly eighteen months of head start on the most important asset class | Requires building or licensing an equivalent pipeline |
| Costume cloth and hair | Chaos Cloth and Groom are in-engine and battle-tested | Cloth is weaker; strand hair needs third-party |
| Skating locomotion | Pose Search (motion matching) and Motion Warping ship in-engine — precisely the tools this problem needs | Requires Kinemation or a bespoke system |
| Ice rendering | Lumen, planar reflections, Nanite, RVT for tracings | HDRP is capable; more assembly required |
| Replays and Kiss & Cry | Sequencer is an entire feature you would otherwise build | Timeline is thinner |
| Iteration speed | Slower; C++ compile times are a real daily tax | **Faster — Unity's genuine advantage** |
| Crowd | Mass + Niagara instancing | **DOTS is excellent here** |

Unity wins iteration speed and crowd performance. Unreal wins the character, costume, animation
and cinematic pipeline — which is most of this game.

> **Decided: Unreal Engine 5.4+** ([D2](open-decisions.md#d2--engine), 2026-09-03), ahead of
> pre-production rather than at the week-2 deadline. The table above is retained as the reasoning,
> not as an open question. Two consequences are now standing instructions rather than
> recommendations: **write `USkateMovementComponent`, never bend `CharacterMovementComponent`**,
> and treat the Unreal idiom in [§10](#10--reference-code) as literal rather than illustrative.

> ### Do not use CharacterMovementComponent
> UE's built-in character movement is a capsule-and-ground-plane walker with hard-coded
> acceleration and braking. Every one of its assumptions is wrong here. Write a
> `USkateMovementComponent` deriving from `UPawnMovementComponent`, ticking your own fixed-step
> solver. Attempting to bend CMC into a carve model is the second most expensive wrong turn
> available on this project.

## 6.2 Code architecture

Not full ECS. The requirement that actually shapes the architecture is **determinism** — replays,
ghost opponents, server-side verification and the Composer's transition solver all need to
reproduce a run bit-for-bit. UObject-heavy gameplay code fights that.

```
┌─ PRESENTATION ────────────────────────────────────────────────────────────────┐
│  Actors · AnimBP + Control Rig · Niagara · Wwise · UMG · CameraDirector        │
│  Reads simulation state. Never writes it. Fully removable for headless runs.   │
└───────────────────────────────────────────────────────────────────────────────┘
                                      ▲ state snapshot each frame
┌─ GAMEPLAY (UObject) ──────────────────────────────────────────────────────────┐
│  ProgramDirector · JudgePanel · TechnicalPanel · CareerState · MusicDirector   │
│  ReplayRecorder · ComposerSolver · RivalAI                                    │
└───────────────────────────────────────────────────────────────────────────────┘
                                      ▲ FElementResult events
┌─ SIM CORE (POD structs · 120 Hz fixed · no engine types · no allocation) ──────┐
│  FSkateSolver · FJumpResolver · FSpinResolver · FIceSurface                    │
│  FStaminaModel · FElementRecognizer · FBalanceModel                            │
└───────────────────────────────────────────────────────────────────────────────┘
                                      ▲ FSkaterInput (recordable, 12 bytes/tick)
┌─ DATA (DataAssets, hot-reloadable, no logic) ─────────────────────────────────┐
│  ScaleOfValues · JumpDefs · SpinFeatures · RinkDefs · MusicGrids · JudgeProfiles│
└───────────────────────────────────────────────────────────────────────────────┘
```

| Type | Responsibility |
| --- | --- |
| `FSkaterState` | The complete ~15-variable authoritative state of one skater. POD. |
| `FSkaterInput` | One tick of player or AI intent. POD, 12 bytes, the unit of recording and replay. |
| `FSkateSolver` | Advances one skater one tick. A pure function of (state, input, ice). No side effects. |
| `FIceSurface` | The damage/snow/tracing grid. Queried for friction and bite; written by every blade pass. |
| `FJumpResolver` | Load → takeoff → air → check → land, with full rotation accounting. |
| `FSpinResolver` | Angular momentum integration, centering error, live feature detection for levels. |
| `FElementRecognizer` | **The architectural keystone.** Watches physical state and classifies what was actually done, the way a technical specialist does. It does not know what button you pressed. |
| `FTechnicalPanel` | Turns a recognised element into a called element with rotation and edge calls. Deterministic. |
| `FJudgePanel` | Nine judge models producing GOE and component scores. Stochastic, seeded. |
| `FScoreCalculator` | Base values, GOE aggregation, PCS factors, deductions, segment totals. |
| `UProgramDirector` | Holds the planned program; compares intent against what the recognizer observed. |
| `UMusicDirector` | Beat grid, accent windows, Wwise transport sync, clap-along gating. |

> ### Why the recognizer matters more than it looks
> Because the game observes physics rather than reading input intent, *one* truth source serves
> Competition, Free Skate, the Composer, replay verification and the AI. A player who
> accidentally produces a clean double axel while messing about in Free Skate gets told they did.
> An AI that under-rotates is judged by exactly the code that judges the player. And a cheated
> program cannot be constructed by faking an event stream, because the server re-simulates and
> re-recognises from raw input.

## 6.3 Networking

The load-bearing observation: **singles figure skating has no simultaneous play.** One skater is
on the ice at a time. This removes the hardest problem in sports netcode before it starts, and the
architecture should exploit it rather than ignoring it.

| Mode | Model | Cost |
| --- | --- | --- |
| **Async Competition** *(primary)* | A run is recorded as an input stream plus periodic state keyframes for drift correction. Opponents are replayed deterministically on the client. The server re-simulates headlessly to verify — which also eliminates cheating, since the only way to fake a score is to produce inputs that genuinely earn it. | ~200–500 KB per 4-minute program compressed |
| **Live Events** | Scheduled windows; each entrant skates locally with a real draw order, results stream to a shared leaderboard, and a genuine six-minute warm-up lobby precedes the group. | Leaderboard traffic only |
| **Warm-Up Group** *(real-time)* | Six players sharing ice with nothing contested. **Client-authoritative movement** with server-side rate limiting, remotes interpolated at ~100 ms, soft collision only. No prediction, no reconciliation, no rollback. Saying this out loud saves months: nothing here is worth defending against. | ~4 KB/s per client |
| **Pairs / Ice Dance** *(hard)* | The only genuinely contested case — holds, lifts and throws couple two bodies. Use **authority handoff**: while partners are linked, the lifting partner's client owns the two-body constraint; the other client predicts and rolls back *only the shared constraint*, typically three to five frames. Two clients and a tiny state make rollback cheap. Cross-fade authority over 250 ms on link and unlink. | Post-launch; ~4 months of a senior network engineer |

### Determinism discipline

- Fixed 120 Hz simulation step, decoupled from render.
- No `float` ordering dependence: strict evaluation order, no fast-math, FMA contraction disabled,
  one blessed transcendental library shared across platforms.
- All randomness from a seeded, explicitly-advanced PRNG stored in the replay header.
- **CI determinism harness from month five:** replay ten thousand recorded programs nightly on
  every target platform and assert bit-identical final scores. Determinism bugs found in month
  twenty are catastrophic; found in month six they are an afternoon. If float parity proves
  unreliable across compilers, the fallback is fixed-point in the sim core — plan the type
  abstraction now so that switch is a typedef.

## 6.4 Performance

| Target | Resolution | Frame rate | GI / reflections |
| --- | --- | --- | --- |
| PS5 / XSX — Quality | 1440p → 4K TSR | 30 | Lumen hardware RT + planar ice |
| PS5 / XSX — Performance | 1080p → 4K TSR | 60 | Lumen software + planar ice at half res |
| Series S | 1080p | 60 | Baked GI + SSR, crowd at 40% |
| PC minimum (GTX 1660) | 1080p | 60 | Baked GI + SSR |
| PC recommended (RTX 3070) | 1440p | 60+ | Lumen + planar ice |

- **Baked GI is genuinely viable here**, and that is unusual. The arena geometry and its light rig
  are entirely static; only the skater and a handful of spotlights move. A lightmapped path with a
  few movable lights looks excellent and costs almost nothing — ship it as the low-spec path
  rather than as a degraded Lumen.
- **Crowd:** skeletal meshes for the front two rows only, vertex-animation-texture instances for
  the middle rings, camera-facing impostors beyond. Eighteen thousand spectators in under 1.5 ms.
- **Planar reflection** is a second scene render — half resolution, aggressively culled to skater,
  boards and fixtures, and disabled above 25° camera elevation where nobody can see it anyway.
- **Tracings:** a single 2048² render target over a 60 × 30 m rink is 3.4 cm per texel, which is
  ample; 4096² on high settings. Accumulated by a compute shader from the sim's contact points at
  simulation rate. Effectively free.
- **Skater LODs:** 80k triangles at LOD0 for replays and close coverage, 40k at LOD1, 15k at LOD2.
  Three groom LODs. Cloth substeps scale with rotation speed and freeze entirely during
  re-simulated replays.
- **GPU instancing** for costume crystals, seating, boards advertising and rink fixtures. Async
  compute for the ice grid and Niagara.

---

# 07 · AI Opponents, Judges & Crowd

## 7.1 The rival skaters

> ### The AI plays the game
> Rival skaters do not run scripted animations with rolled outcomes. They feed `FSkaterInput` into
> the same solver the player uses, with noise scaled by their consistency and current nerve. They
> fall for the same physical reasons you do — a shallow load, a late check-out, a wrong edge — and
> the technical panel calls them with the same code. One balance pass covers both sides, mistakes
> are never arbitrary, and a rival's under-rotation is genuinely visible in their body before the
> call appears.

| Persona field | Range | Effect |
| --- | --- | --- |
| `TechnicalCeiling` | 0–1 | Hardest element they will attempt at all |
| `Consistency` | 0–1 | Inverse of baseline input noise |
| `Artistry` | 0–1 | Carriage activity, accent hit rate, PCS ceiling |
| `Nerve` | 0–1 | Resistance to pressure. Low nerve degrades fast under a deficit |
| `RiskAversion` | 0–1 | Weight on score variance when choosing a layout |
| `Signature` | list | Elements they are disproportionately good at |
| `Form` | −1…+1 | Season-long momentum; drifts with results, decays toward zero |

### Strategic layer — utility selection of the program layout

```
U(layout) = E[score] − riskAversion · σ[score] + ambition · max(0, deficit)
```

Per-element success probabilities are conditioned on *projected stamina at that point in the
program* and on current nerve, so the model naturally discovers what real coaches know: a quad in
the last minute is worth far less in expectation than the same quad at the start, unless the 1.1×
bonus and a points deficit tip it. A skater eight points down after the short program will
genuinely upgrade — adding a quad, back-loading jumps, accepting variance because the safe layout
cannot win. That behaviour falls out of the formula rather than being scripted, and it is the most
dramatically satisfying thing the AI does.

### Tactical layer — behaviour tree during the program

- Navigate to the entry position for the next element, choosing a path that covers unused ice
  (which Composition rewards) and builds the required speed.
- Execute via the same five-beat loop, with load depth, check timing and pull-in rate perturbed by
  `noise = (1 − Consistency) · (1 + Nerve)`.
- **The wobble.** Nerve rises with crowd volume, score deficit, late draw position, and sharply
  after any mistake; it decays with each clean element. Higher nerve means noisier input and a
  slower pull-in, so a skater who falls on their opening jump measurably skates worse for the next
  thirty seconds. This is the emotional truth of the sport and it is four lines of code.
- **Recovery decisions.** After a mistake the tree may downgrade a planned element (popping a 3A to
  a 2A to stop the bleeding) or upgrade a later one to recover base value. Both are real, both are
  dramatic, and the commentary system has lines for both.

### Coach AI (career)

Reads your recorded programs — element quality metrics trended over sessions — and proposes
training focus, flags the elements whose variance is costing you most, and warns about a layout's
risk profile using the same E/σ machinery the rivals use. The coach is the diegetic wrapper on your
own analytics.

## 7.2 The judging panel

Nine judges, each a small model rather than a formula. This is the highest-value juice decision in
the entire scoring design: because judges disagree, the same run twice never scores identically,
and a score starts to feel like an opinion you earned rather than a number you unlocked.

| Field | Effect |
| --- | --- |
| `Strictness` | Weight on visible blemishes — a strict judge punishes a hand-down harder |
| `TechnicalBias` | Rewards difficulty; forgives a scrappy quad more readily than a safe triple |
| `ArtisticBias` | Weights Presentation and Composition upward relative to the panel |
| `Halo` | Reputation lift — an established skater's component scores drift up. Documented and much-discussed in the real sport; modelled here as a fact of the simulation, without editorial comment |
| `NoiseSigma` | Per-judge random spread, 0.3–0.9 GOE |
| `Federation` | Small home-skater warmth at national events; disclosed to the player in the protocol view |

**The technical panel is separate and deterministic**, exactly as in the sport. A Technical
Specialist *calls* the element — identifies it, applies `q`, `<`, `<<`, `e`, `!` — with no opinion
involved, and only then do the nine judges award GOE against the called element. Separating these
means the tech call can be surfaced live on screen the way a broadcast does, and it means a
wrong-edge lutz is punished identically by every judge while its execution quality is still debated.

## 7.3 Crowd

An arena-mood scalar per seating section, driven by anticipation and result events, with per-agent
reaction delays so a reaction visibly propagates outward from the front rows rather than firing as
one block. Home-crowd warmth per venue in career. The crowd's most important behaviours are the two
quiet ones: the 1.2-second hush before a big jump, and the silence after a fall.

---

# 08 · Development Roadmap & Risk

| Phase | Months | Team | Key deliverables | Exit gate |
| --- | --- | --- | --- | --- |
| **Pre-production** | 1–4 | 8 | Carve solver and balance model on a programmer-art capsule · control scheme candidates · engine spike on the ice material and tracing RVT · SOV and element data model · mocap plan, volume booked, skating consultant hired as permanent staff · style pillar images | **"Is carving fun with no jumps, no score and no art?"** Twenty external testers, two sessions each. Genuine kill-or-continue. |
| **Vertical slice** | 5–10 | 22 | One rink at ship quality · one skater with full costume, cloth and groom · one complete 2:40 short program containing every element category · full judging pipeline including the nine-judge panel · Broadcast Director · Wwise blade layer and arena states · Kiss & Cry · determinism harness online | A stranger plays for twenty minutes and asks when it ships. Cloth and hair survive a level-4 change-foot combination spin. 60 fps on target hardware. |
| **Production → Alpha** | 11–22 | 38 | All twelve rinks to first pass · both mocap shoot blocks captured and integrated · all modes playable · Composer v1 · career loop with rival progression · async and warm-up netcode · full element coverage · The Patch · commissioned score delivered | **Alpha:** feature complete and playable start to finish. All content present at least in first pass. |
| **Beta** | 23–27 | 40 | Content complete · balance and difficulty passes across all five assist tiers · accessibility audit · localisation (10 languages, Japanese and Korean prioritised) · performance lock · certification · three external playtest waves · demo build | Cert submission, zero A-class bugs, perf targets met on every SKU. |
| **Launch & LiveOps** | 28–30+ | 24 | Ship · day-one patch · Season 1 content drop · Composer sharing backend scaling · Switch 2 port · VR studio DLC · Pairs expansion pre-production | Stable retention curve; Composer sharing shows organic growth. |

## Team composition at production peak

| Discipline | FTE | Notes |
| --- | --- | --- |
| Gameplay & systems engineering | 7 | Two on the sim core alone; that code is the game |
| Animation engineering | 3 | Motion matching, warping, Control Rig procedural layer |
| Rendering engineering | 3 | Ice material, tracings, reflections, crowd, performance |
| Network & backend | 2 | Rising to 3 for the pairs expansion |
| Tools & pipeline | 2 | The Composer's editor tooling is a real product |
| Character art | 5 | Bodies, costumes, grooms, the crystal system |
| Environment art | 4 | Twelve rinks |
| Animation | 5 | Mocap cleanup plus hand-authored hero elements |
| Technical art | 2 | Cloth, hair, shaders, Niagara |
| Design | 4 | Systems, content, career, tutorial |
| Audio | 2 | Plus contracted composer and orchestra |
| UI/UX | 2 | |
| QA | 4 | Rising to 10 contracted in beta |
| Production & leadership | 3 | |
| **Skating consultant** | 1 | **Permanent, not contracted.** A competitive or recently retired skater, in the building, playing builds weekly. Every authenticity decision in this document needs someone who can say "no, that is not what that feels like." |

## Risk register

| # | Risk | P | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **The control scheme is not fun.** No shipped game has used analog lean plus analog knee as its primary verb. The entire project rests on an unproven feel. | Med | **Fatal** | Build it in month one on programmer art. Weekly playtests with non-skaters from month two. A real kill gate at month four with the authority to stop the project. Keep two fallback schemes prototyped rather than one. |
| 2 | **Skating mocap is genuinely hard.** Optical volumes cannot cover a rink; IMU suits drift; jumps and spins are the worst case for both. | High | Major | IMU on real ice for locomotion, optical volume with a rotating harness rig for air phases, video reference throughout. Book a *second* shoot block into the schedule and budget from day one. Cast competitive skaters, not stunt performers. |
| 3 | **Music licensing cost or expiry.** | Med | Major | Commissioned score plus fresh recordings of public-domain repertoire as the backbone (§5.2). Licensed tracks capped at four and architecturally isolated with fallback references. Share choreography, never audio. |
| 4 | **Cloth and hair fail at spin speeds.** Solvers explode above roughly 5 rev/s and the failure is spectacular. | High | Moderate | Procedural conical deformer fallback above a rotation threshold; bound-root groom mode. **Solve during the vertical slice**, where it is a tech-art problem, not in beta where it is a schedule crisis. |
| 5 | **Cross-platform determinism breaks ghosts and verification.** | Med | Major | CI harness from month five replaying ten thousand programs nightly on every platform. Abstract the sim's scalar type now so a switch to fixed-point is a typedef rather than a rewrite. |
| 6 | **Pairs and ice dance consume the schedule.** | High | Major | Cut from launch scope in pre-production and communicate it externally early. Do not carry it as "maybe." |
| 7 | **Audience size.** Skating fandom is engaged but not large, and sim depth narrows the funnel further. | Med | Major | Free Skate and the Composer reach past the sport's fandom into the creative-sandbox audience. The assist ladder makes the game genuinely playable at Show tier. Demo early; the visual hook does the marketing. |
| 8 | **ISU rules change annually.** | Certain | Minor | Everything scoring-related lives in hot-reloadable DataAssets. A season update is a data patch, and shipping it promptly is a visible authenticity signal to the fandom. |
| 9 | **Athlete and federation licensing.** | — | — | *Do not pursue it at launch.* It costs money, adds legal dependencies, constrains the career fiction, and buys almost nothing this game needs. Revisit as optional DLC once the game exists. |

---

# 09 · Advanced Features & Innovation

## A · The Composer

**Sports games let you pick a play. None let you compose the performance.** The Composer is a
timeline over your music on which you place elements, and a solver that generates the skating in
between.

Crucially, you author *intent*, not animation: an element, its required entry edge, a position on
the ice, and a musical anchor. A transition solver — an A* search over the motion-matching
database, constrained by the physics solver — finds skating that arrives at the right place, on
the right edge, at the right speed, at the right moment, while covering fresh ice. Then you have
to go and skate it yourself. The Composer never performs for you.

| Increment | Ships | Scope |
| --- | --- | --- |
| **v0 — internal** | Vertical slice | Element list plus auto-generated connective skating. **Needed anyway** to give AI rivals programs, so the hardest part is paid for by a system you must build regardless. |
| **v1 — player timeline** | Launch | Drag elements onto the beat grid; live validation against well-balanced program requirements and the Zayak rule; the solver returns a skatable program and a projected stamina curve. |
| **v2 — expression** | Launch | Choreographic accent keys — arm sweeps, head snaps, épaulement — on the beat grid, plus lighting cues for Gala. |
| **v3 — sharing** | +3 months | Choreography-only payloads (§5.2), community browsing, "skate someone else's program" as a challenge with per-program leaderboards. The long tail of the whole game. |
| **v4 — pairs** | Year one | Two-skater choreography with lift and throw placement. |

## B · The Line — persistent ice tracings

Every edge you take is written into the ice: visible, accumulating, and physically consequential.
At the end of a program the camera pulls up and your entire performance is revealed as a drawing on
the surface. Figure skating is *named* for this — the figures were the tracings, and they were the
judged discipline until 1990. No game has ever put them back.

| Increment | Effort | Scope |
| --- | --- | --- |
| **v0 — visual** | ~1 week | Blade contact points accumulate into a render target that drives normal and roughness on the ice material. Immediately beautiful, and cheap enough to be in the first playable build. |
| **v1 — physical** | ~2 weeks | The same grid feeds friction and edge bite back into the solver. Damaged ice grips less. Resurfacing between skaters becomes meaningful. |
| **v2 — The Patch** | ~4 weeks | The tutorial becomes school figures: trace a figure eight, scored by a distance transform of your tracing against a reference curve. Teaches edges before elements, is historically authentic, and is a genuinely good small game. |
| **v3 — The Line** | ~3 weeks | An end-of-program stylised poster of your tracing, shareable as an image, and used inside the Composer to visualise ice coverage — which is literally a Composition criterion. Free marketing: these images are inherently shareable. |
| **v4 — analysis** | Post-launch | Overlay your line against a rival's or your own previous attempt. The Coach AI reads it directly. |

## C · Commentary

A two-person booth generated from the element event stream: an anticipation line before an element,
a call during it, an assessment after, and colour commentary keyed to career narrative and the score
situation. **Build it as an authored line bank with variation selection, not a runtime language
model** — latency, reliability and tone control all argue against generation at play time. If you
want the breadth that generation offers, use it *offline at content-build time* to write and record
a very large line bank with a licensed voice, then ship the bank. The player gets variety; the game
gets determinism.

---

# 10 · Reference Code

The four reference implementations live as real files in
[`src/reference/`](../src/reference/) rather than being duplicated here, so that the document and
the code cannot drift apart.

| File | What it specifies |
| --- | --- |
| [`SkateSolver.cpp`](../src/reference/SkateSolver.cpp) | **The carve solver.** One skater, one tick, a pure function of state, input and ice. Computes the geometric and dynamic radii, tests whether the edge can hold, integrates the arc, applies lateral propulsion, and writes the tracing. |
| [`JumpResolver.cpp`](../src/reference/JumpResolver.cpp) | **Jump physics.** Load → air → land. Ballistics and angular momentum are fixed at takeoff; the air phase controls only moment of inertia. Landing performs the rotation accounting that produces `q` / `<` / `<<` / `e` calls. |
| [`ScoreCalculator.cs`](../src/reference/ScoreCalculator.cs) | **Scoring.** ISU data model, base values with rotation and edge adjustments, the second-half bonus, trimmed-mean GOE across nine judges, three-component PCS with segment factors, the deduction schedule, and the per-judge GOE model. |
| [`SkaterAnimDriver.cpp`](../src/reference/SkaterAnimDriver.cpp) | **Animation state resolution.** Layered priority selection (recovery → element → locomotion) plus the post-selection warping chain that makes captured clips fit arbitrary carve radii. |

These are **specifications as code** and do not compile — helper functions are described in this
document and deliberately left to the implementation. Three structural properties are load-bearing
and should survive any rewrite:

1. **`FSkateSolver::Tick` is a pure function.** Everything downstream — replays, ghosts, server
   verification, the Composer — depends on this holding.
2. **Jump ballistics are fixed at takeoff.** The air phase has exactly one lever because that is
   the only lever a real skater has. Resist every request to add mid-air correction.
3. **The animation layer never decides anything.** If animation writes back into `FSkaterState`,
   determinism is gone and so is multiplayer.

---

*Edgework · Design & Technical Bible · v1.0. Scale of Values and component factors are indicative
and must be verified against current ISU regulations before content lock. Open questions are
tracked in [open-decisions.md](open-decisions.md).*
