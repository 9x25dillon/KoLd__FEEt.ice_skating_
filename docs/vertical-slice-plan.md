# The Vertical Slice

**24 weeks · 8 → 22 FTE · ~$1.95M · two questions, not one.**

Pre-production asked whether the verb was fun. The vertical slice asks something different, and
it asks it twice:

> ## 1. Is this game worth making at this quality bar?
> ## 2. And do we now know what the rest of it costs?

The second question is the one teams forget, and it is arguably worth more. A vertical slice is
not only a proof of quality — it is a **measuring instrument for production.** Every asset built
here should be timed, and those times become the production schedule. A slice that looks
magnificent but produces no cost model has done half its job.

Scheduled in [pre-production-plan.md §5](pre-production-plan.md#5--parallel-tracks) as a
parallel track, written in weeks 13–16 **before the kill gate result is known**, so that it is a
plan rather than a rationalisation.

---

## Contents

1. [What a slice is, and is not](#1--what-a-slice-is-and-is-not)
2. [Scope](#2--scope)
3. [Keep, rewrite, formalise](#3--keep-rewrite-formalise)
4. [The ramp: 8 to 22](#4--the-ramp-8-to-22)
5. [Week by week](#5--week-by-week)
6. [The mocap blocks](#6--the-mocap-blocks)
7. [The measurement discipline](#7--the-measurement-discipline)
8. [The green-light gate](#8--the-green-light-gate)
9. [Risks](#9--risks)
10. [Budget](#10--budget)

---

## 1 · What a slice is, and is not

| | Pre-production | Vertical slice |
| --- | --- | --- |
| Shape | **Broad and ugly** | **Narrow and beautiful** |
| Question | Is the verb fun? | Is the loop compelling, at the bar, at a knowable cost? |
| Duration tested | 10 seconds of carving | 2 minutes 40 seconds of judged program |
| Art | Refused | Ship quality, no exceptions |
| Failure mode | Stop the project | Cut content scope |

The slice is a thin cut through the **entire** game at final quality: one rink, one skater, one
complete short program, judged, with the camera, audio and score reveal a shipped build would
have. Nothing is placeholder. If a system is in the slice it is in at ship quality, and if it
cannot be at ship quality it is out.

> ### Pre-production deliberately did not test this
> The kill gate tested the verb in isolation, and said so explicitly. A four-minute judged
> program with stakes, music, a crowd and a score is a genuinely different question — the
> connective tissue, the pacing, the tension of a program that is going well. **That question is
> this gate's, and it is the reason a slice exists at all.**

---

## 2 · Scope

### The one rink: Nationals Coliseum

Chosen deliberately over the alternatives. Rideau Arena is drab by design and would not prove the
visual bar. The Olympic Arena is the most expensive thing in the game — eighteen thousand
spectators — and building it first would confuse "can we hit the bar" with "can we afford the
crowd." Nationals Coliseum has six thousand seats, warm wood, broadcast lighting and real
atmosphere: **every hard problem, at a representative cost.**

### The one skater: women's singles

Also chosen for difficulty rather than convenience. A women's costume brings the skirt — the
Chaos Cloth problem that [bible risk 4](design-bible.md#risk-register) says must be solved here
and not in beta — and the discipline includes the layback and Biellmann positions, which are the
worst cases for both groom simulation and the flexibility gating in
[`spin-positions.json`](../data/spin-positions.json). **Take the hard case first; the easy case
never teaches you anything.**

### The one program: a complete 2:40 short program

Every element category, because the judging pipeline is only proven if it has seen one of each:

| Element | Why it is in |
| --- | --- |
| `3Lz+3T` | A combination, and the longest, most curvature-constrained entry template in the game |
| `3F` | An edge-callable jump, so the `e` and `!` calls get exercised |
| `2A` | The only forward takeoff — proves the direction-change docking in the transition solver |
| `FCSp4` | A flying entry |
| `LSp4` | Layback — the groom and cloth worst case |
| `CCoSp4` | Change-foot combination spin — **the Spin Test** (§8) |
| `StSq3` | The step-sequence level detector, the variety ladder, full ice coverage |

### In scope

Sim core at production architecture · the full judging pipeline (technical panel, nine judges,
PCS, deductions) · Composer v0 · one AI rival skating one program · Broadcast Director · Wwise
blade layer and arena states · one commissioned music track with a hand-authored beat grid ·
tracings at ship quality · costume with crystals, cloth and groom · Kiss & Cry · determinism
harness · **the telemetry and cost measurement rig**.

### Out of scope

Career · other rinks · other skaters · other disciplines · Free Skate · Gala · the Patch ·
the player-facing Composer UI · menus beyond what the slice needs · netcode · multiplayer ·
pairs · VR · commentary · the remaining 29 music tracks.

> **One AI rival is in scope, and that is not padding.** A score with nowhere to land is not a
> score. The rival gives the Kiss & Cry a standings context, and it proves the claim that matters
> most in [bible §7.1](design-bible.md#71-the-rival-skaters) — that the AI feeds inputs into the
> same solver and fails for the same physical reasons. One rival. Not two.

---

## 3 · Keep, rewrite, formalise

The prototype was built to answer a question, not to be a foundation. Deciding this explicitly in
week 17 prevents the most common way slices rot: prototype code silently becoming production code
and carrying its shortcuts into ship.

| Prototype asset | Disposition | Why |
| --- | --- | --- |
| **The carve solver** | **Keep**, nearly verbatim | It is the answer to the kill gate. Changing it invalidates the thing you just proved. Wrap it, do not rewrite it. |
| Balance model, stamina | Keep, retune | Constants come from prototype telemetry; the structure holds. |
| Telemetry / replay recorder | **Keep and promote** | Already the §6.3 replay system. Now becomes the determinism harness too. |
| Data model, primitives | Keep | Already data-driven. |
| Input layer | **Rewrite** | Three schemes collapse to one; the toggle scaffolding goes. |
| Everything presentational | **Rewrite** | Debug cameras, capsule rigs, the grey plane. None of it survives contact with art. |
| Test courses (Figure Eight, Slalom) | Keep, repurpose | They become The Patch's foundation later, and stay as regression fixtures now. |
| **Layered architecture** ([§6.2](design-bible.md#62-code-architecture)) | **Formalise** | The prototype will not have it. Presentation/gameplay/sim/data separation is imposed in weeks 17–19, before there is enough code for it to hurt. |

Doing the architecture split in week 17 costs about two engineer-weeks. Doing it in month 20
costs about three months and will not happen.

---

## 4 · The ramp: 8 to 22

You cannot add fourteen people in week 17. Attempting it is how slices lose their first month.

| Week | Headcount | Joining |
| --- | --- | --- |
| W17 | 8 | The pre-production team, continuous |
| W18–20 | 14 | +2 character art, +2 environment art, +1 animation, +1 tech art |
| W21–24 | 19 | +2 animation, +1 rendering, +1 design, +1 audio |
| W25–26 | 22 | +1 gameplay, +1 UI/UX, +1 QA |

Three rules that make the ramp survivable:

- **Every hire costs two to three weeks of an existing person's time.** Budget it explicitly. Do
  not pretend a new starter is productive on day one, and do not pretend their onboarding is free
  to the person doing it.
- **Nobody joins in the last eight weeks.** A hire in week 33 costs more than they contribute
  before the gate.
- **The pre-production eight are the onboarding capacity.** That caps the ramp rate more than the
  recruiting pipeline does, and it is why the curve above is shaped the way it is.

---

## 5 · Week by week

Weeks continue the pre-production numbering. W17 is the first week after the kill gate.

### Month 5 · Foundations (W17–20)

| Week | Deliverable |
| --- | --- |
| **W17** | **Pin the quality bar.** Not a discussion — a wall of eight reference frames, chosen and signed, that define what "ship quality" means for ice, costume, lighting and crowd. Until this exists, "ship quality" is undefined and every later argument about it is unresolvable. Architecture split begins. |
| **W18** | Layered architecture imposed. Input collapsed to the winning scheme. Rink blockout at true scale with the real light rig positions. Ramp begins. |
| **W19** | Ice material v1 with planar reflection. Tracings promoted from prototype to the RVT pipeline. Character base mesh and rig. |
| **W20** | **Mocap block 1 shoots** (§6). Composer v0 online — the transition solver's lattice and primitive library, no UI. |

### Month 6 · First playable (W21–24)

| Week | Deliverable |
| --- | --- |
| **W21** | Mocap block 1 ingestion. Motion matching database first pass. Costume base garment. |
| **W22** | Orientation and stride warping online — the moment the skater stops sliding like furniture. Crowd system first pass. |
| **W23** | **M6 — First playable slice.** Skate the rink, real animation, real ice, no elements yet. Internally this is the first time it looks like the game. |
| **W24** | Jump and spin resolvers to production. Groom first pass. Wwise blade layer. |

### Month 7 · Systems (W25–28)

| Week | Deliverable |
| --- | --- |
| **W25** | Judging pipeline: technical panel calls, nine-judge GOE, PCS, deductions. Protocol sheet data flowing. |
| **W26** | Level-feature detection ([level-features.md](level-features.md)) wired to the spin resolver. Ramp completes at 22. |
| **W27** | Broadcast Director with the four camera operators and the never-cut-during-a-jump rule. AI rival skating a solved program. |
| **W28** | **M7 — The program runs end to end.** All seven elements, scored, on camera. Ugly in places, complete throughout. |

### Month 8 · Quality (W29–32)

| Week | Deliverable |
| --- | --- |
| **W29** | Costume crystals with GPU instancing and the sparkle pass. Arena lighting final. |
| **W30** | **Mocap block 2 shoots** — jumps, spins, air phases. |
| **W31** | **M8.1 — The Spin Test.** A `CCoSp4` at 6 rev/s with full costume, cloth and groom, zero artifacts, at frame rate. This is [bible risk 4](design-bible.md#risk-register) discharged, on a date, in the phase the bible says it must be. |
| **W32** | Audio: arena states, crowd anticipation and reaction, the interiority mix during jumps. Music track delivered with beat grid. |

### Month 9 · Integration (W33–36)

| Week | Deliverable |
| --- | --- |
| **W33** | Mocap block 2 integrated. Kiss & Cry scene. |
| **W34** | Performance pass to target: 60 fps at the quality tier on console hardware. |
| **W35** | Determinism harness green across all target platforms. Full art polish pass. |
| **W36** | **M9 — Content complete for the slice.** Feature freeze. Only bug fixes and tuning after this. |

### Month 10 · Measure and gate (W37–40)

| Week | Deliverable |
| --- | --- |
| **W37** | Build lock. Playtest protocol pilot with four testers. |
| **W38–39** | **20 testers.** Blind quality comparison with 10 external artists. Cost model assembled from the measurement rig. |
| **W40** | **THE GREEN-LIGHT GATE.** Analysis, production forecast, decision, postmortem. |

---

## 6 · The mocap blocks

Two blocks, deliberately separated, and the separation is the point.

| | Block 1 (W20) | Block 2 (W30) |
| --- | --- | --- |
| **Content** | Locomotion, strokes, crossovers, all turns, step sequences, element entries and exits, carriage, transitions | Jump air phases, spin positions, flying entries, falls, get-ups |
| **Method** | IMU suits on real ice — an optical volume cannot cover a rink | Optical volume with a rotating harness rig |
| **Clips** | ~900 | ~600 |
| **Why this order** | It is the easier capture and the larger volume. Shoot it first, learn from it, and let those lessons reach block 2. | Ten weeks later, informed by everything block 1 taught about drift, marker occlusion and what the warping layer actually needs. |

Most teams shoot both blocks at once and repeat all their mistakes twice at full scale.

**Contingency:** if block 1 returns unusable data — IMU drift is
[risk 2](design-bible.md#risk-register) and it is rated High — the schedule absorbs a reshoot in
W24 without moving the gate, because block 1's integration has four weeks of float. Block 2 has
no such float, which is another reason it goes second.

Cast competitive skaters. The skating consultant runs the shot list.

---

## 7 · The measurement discipline

**This is the half of the slice that teams skip.** Every asset built here is timed, and those
times become the production forecast. Instrument it from week 17, not from week 37.

| Asset class | Built in slice | × remaining | Forecast basis |
| --- | --- | --- | --- |
| Rink, blockout → ship | 1 | 11 | Environment artist-weeks |
| Costume, modelled → simulating | 1 | ~40 garments | Character artist-weeks |
| Spin position, authored → tuned | 7 | 19 | Animator-days |
| Mocap clip, captured → integrated | ~1,500 | 0 (both blocks shot) | Cleanup hours per clip |
| Music track with beat grid | 1 | 47 | Composer + designer days |
| Element, resolver → judged → animated | 7 | ~25 total | Engineer + animator weeks |
| Rink light rig, authored → optimised | 1 | 11 | Tech artist-days |

The forecast arithmetic done honestly is worth more at the gate than any amount of optimism:

> If a rink takes 9 environment artist-weeks and production has 4 environment artists for 12
> months, then 11 rinks × 9 = 99 artist-weeks ÷ 4 artists = 25 weeks. **That fits.**
> If a rink takes 16 weeks, it is 44 weeks against a 48-week phase with no contingency, and the
> honest answer is to cut to eight rinks at the gate rather than to discover it in month 20.

Record **variance**, not just means. Build two costumes if you can — the second one tells you how
much of the first was learning. A cost model with no variance estimate is a guess wearing a
number.

---

## 8 · The green-light gate

Three gates, all must pass. Criteria signed in **week 36**, before the playtest data exists —
the same pre-commitment discipline as the kill gate, for the same reason.

### Gate A · Quality

| # | Criterion | Threshold |
| --- | --- | --- |
| A1 | **Blind bar comparison.** Ten external artists rate slice captures against the W17 reference frames, unlabelled and interleaved | Slice within **0.7** of the reference mean on a 5-point scale |
| A2 | **The Spin Test.** `CCoSp4` at 6 rev/s, full costume, cloth and groom | Zero visible artifacts, at frame rate, three consecutive runs |
| A3 | **Performance** | 60 fps at the performance tier and 30 fps at the quality tier, on console hardware, worst-case camera |

### Gate B · The loop

| # | Criterion | Threshold |
| --- | --- | --- |
| B1 | **Voluntary repetition.** 20 testers, one 2:40 program available | Median **≥ 3** full attempts, unprompted |
| B2 | **The stranger test**, made countable | **≥ 60%** ask when it ships or request a build, unsolicited |
| B3 | **Session length** | Median **≥ 25 minutes** |

### Gate C · Cost

| # | Criterion | Threshold |
| --- | --- | --- |
| C1 | **The model exists and is stable** | Per-asset costs measured, with repeated-asset variance **≤ 25%** |
| C2 | **The remaining scope fits** | Forecast completes production in 12 months at 38 FTE with **≥ 15% contingency** |

### Decision rule

| Outcome | Condition | Action |
| --- | --- | --- |
| **GREEN** | All three gates | Green-light production at planned scope. Week 41 begins — see [production-plan.md](production-plan.md). |
| **AMBER** | A and B pass, C fails | **Green-light at reduced content scope.** Cut rinks, garments and music tracks — *never* systems — until the forecast fits with contingency. Re-forecast and proceed. This is the expected outcome, and planning for it is not pessimism. |
| **RED** | A or B fails | The quality bar is not reachable at this budget, or 2:40 of judged skating is not compelling. Stop, or rescope fundamentally — a smaller, cheaper game built around Free Skate and the Composer, per [D1](open-decisions.md#d1--budget-and-team-size). |

> **Note the asymmetry with the kill gate.** There, AMBER bought *time*. Here, AMBER cuts
> *content*. At this stage schedule is the expensive lever and content is the cheap one, and a
> team that reaches for more time when it should reach for less content is how a two-year project
> becomes a four-year one.

### What this gate does not test

Career progression · content fatigue over twenty hours · multiplayer · the Composer as a creative
tool · whether twelve rinks are more fun than six. Those belong to production and to the beta,
and reaching for them here reopens exactly the scope discipline the slice depends on.

---

## 9 · Risks

| # | Risk | P | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Slice creep.** "Just one more rink." "The men's skater is nearly free." Classic and fatal — the slice stops being narrow and stops being finishable. | **High** | Fatal | The scope list in §2 is signed in W17 and changes only by removing. The producer owns the no. Every addition must name what it displaces. |
| 2 | **The ramp destroys velocity.** Fourteen new people, no onboarding budget, four weeks of chaos. | High | Major | Staged ramp (§4), onboarding time explicitly budgeted, and a hard stop on hiring after W26. |
| 3 | **Mocap block 1 unusable.** IMU drift on ice is [risk 2](design-bible.md#risk-register) and rated High. | Med | Major | Four weeks of float before block 1's integration; a W24 reshoot slot held. Video reference on every take regardless. |
| 4 | **Cloth and hair fail at spin speed.** [Bible risk 4](design-bible.md#risk-register). | High | Moderate | Owned as a dated milestone (W31), with the procedural conical deformer fallback already specified. If it is not solved by W31 it is escalated, not deferred. |
| 5 | **Prototype code becomes production code.** Shortcuts made to answer a question get load-bearing. | High | Major | The keep/rewrite/formalise table (§3), decided in W17 and executed W17–19 while the codebase is still small. |
| 6 | **Nobody agreed what "ship quality" means.** The argument surfaces in W35 when it cannot be settled. | Med | Major | W17's pinned reference wall. Eight frames, signed. Gate A1 measures against exactly those frames. |
| 7 | **No cost model at the gate.** The slice looks great and nobody can say what production costs. | Med | Major | §7's measurement rig is instrumented from W17. Gate C fails without it, which makes it un-skippable. |

---

## 10 · Budget

| Line | Cost |
| --- | --- |
| Staff, ramped 8 → 22 over 6 months (≈ 108 person-months, loaded) | $1,296,000 |
| Mocap block 1 — IMU, on-ice, talent, ~900 clips | $95,000 |
| Mocap block 2 — optical volume, harness rig, talent, ~600 clips | $110,000 |
| Animation cleanup outsourcing | $120,000 |
| Music: one track commissioned and recorded, plus the full commission's first payment | $85,000 |
| Concept and outsourced art support | $80,000 |
| Playtesting and the blind artist panel | $18,000 |
| Hardware, dev kits, licences, build infrastructure | $60,000 |
| **Total** | **~$1,864,000** |

Loaded cost at ~$12k per person-month, consistent with
[pre-production §10](pre-production-plan.md#10--budget). With a 5% contingency the ask is
**~$1.95M**.

Cumulative through the green-light gate, including pre-production: **~$2.42M** — roughly 12% of
the projected $18–25M full production, spent to retire the two largest risks in the project
before the expensive phase begins.

---

*Gate criteria are pre-commitments and must be signed in week 36. The scope list in §2 is signed
in week 17 and changes only by removal. Open project-level decisions are tracked in
[open-decisions.md](open-decisions.md).*
