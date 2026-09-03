# Production

**48 weeks (W41–88) · 38 FTE · ~$5.9M · content at a measured rate.**

Pre-production proved the verb. The slice proved the bar and produced a cost model. Production is
where the game gets *built* — and its characteristic failure is not a bad decision, it is
**twelve months of invisible progress ending in a panicked alpha.**

Everything below is structured against that. Quarterly playable builds instead of a single
distant alpha. Content shipping on a published cadence instead of "when it's done." A cut list
written and signed on day one instead of a scope argument in month 20.

---

> ## Read this first: the volumes here are provisional
>
> This plan is **complete in structure and provisional in volume.** Every cadence, milestone,
> ritual, gate and risk below is final. Every *content quantity* — how many rinks, how many
> costumes, how many weeks each takes — is a placeholder derived from the bible's target scope,
> not from measurement.
>
> The real numbers arrive at the [vertical slice green-light gate](vertical-slice-plan.md#8--the-green-light-gate),
> where Gate C produces measured per-asset costs. **[§8](#8--the-w40-recalculation) is the
> recalculation you run that week**, and it is the only part of this document that should change.
>
> Writing it this way round is deliberate: the structure is what takes thought, and it does not
> depend on the numbers. The numbers are arithmetic, and they take an afternoon once you have
> measurements. What you must not do is treat the placeholders as commitments.

---

## Contents

1. [Shape of the phase](#1--shape-of-the-phase)
2. [The cut list](#2--the-cut-list)
3. [Content trains](#3--content-trains)
4. [Risk-first ordering](#4--risk-first-ordering)
5. [The four playable milestones](#5--the-four-playable-milestones)
6. [Mocap block 3](#6--mocap-block-3)
7. [Cadence](#7--cadence)
8. [The W40 recalculation](#8--the-w40-recalculation)
9. [The alpha gate](#9--the-alpha-gate)
10. [Risks](#10--risks)
11. [Budget](#11--budget)

---

## 1 · Shape of the phase

Production is not one phase. It is three things running simultaneously, and confusing them is how
schedules rot:

| Track | What it is | Rate |
| --- | --- | --- |
| **Content trains** | Rinks, costumes, music, elements, skaters. Repeatable units with a definition of done, produced at a measured cadence. | Fixed, measured, published |
| **Feature completions** | Career, Composer v1, The Patch, netcode, Gala, Free Skate. One-off systems that finish and stop. | Risk-ordered, front-loaded |
| **Continuous quality** | Performance, determinism, balance, the first hour. Never "done," always tracked. | Weekly |

The organising principle across all three: **vertical first, then horizontal.** Each mode is taken
to *playable and complete* one at a time, rather than eight modes all sitting at 60%. A mode at
60% cannot be tested, teaches you nothing, and hides its remaining cost.

---

## 2 · The cut list

**The single most valuable artefact in this document.** Written in week 41, ordered, and signed by
the same person who signs the gates.

When — not if — production is behind at month 18, there is no scope argument. There is a list, and
you cut from the bottom of it.

| Order | Cut | Saves | Notes |
| --- | --- | --- | --- |
| 1 | Rinks 12, 11, 10 (Summer Camp, The Old Hall, Harbour Rink) | ~27 artist-weeks | Chosen because they are the least narratively load-bearing. Career never requires them. |
| 2 | Music tracks beyond 30 | ~17 composer-days | The commissioned core stays; the tail goes. |
| 3 | Costume garments beyond 28 | ~12 artist-weeks | The modular system means fewer base garments still combine widely. |
| 4 | Gala mode | ~8 person-weeks | Painful — it is where the fandom lives — but it is additive, not structural. First candidate for a post-launch drop. |
| 5 | Rinks 9, 8 | ~18 artist-weeks | Now it starts to hurt. |
| 6 | Live Events (keep async competition) | ~10 person-weeks | Backend scope. Async ghosts survive; scheduled events do not. |
| 7 | The second playable discipline (men's *or* women's) | ~30 person-weeks | **The line.** Below this you are making a different, smaller game and should say so out loud. |

**Never on the list:** the sim core, the judging pipeline, tracings, The Patch, Free Skate, the
Composer, the assist ladder, accessibility. Systems are not cut in production. If systems must be
cut, the slice gate got Gate C wrong and the honest response is a re-plan, not a salami slice.

---

## 3 · Content trains

Each train has a **definition of done**, an **owner**, and a **published rate**. The rate is
measured in the slice and re-measured every four weeks; it is a fact about the team, not a target
to be exhorted.

| Train | Unit | Definition of done | Placeholder rate | Total |
| --- | --- | --- | --- | --- |
| **Rinks** | One venue | Blockout → art → lighting → perf-passed → audio IR captured → signed off in a lit review | 4 weeks per artist pair | 11 remaining |
| **Costumes** | One garment set | Modelled → textured → crystals placed → cloth-simulating → LOD'd → passes the Spin Test | 1.5 weeks per artist | ~40 |
| **Music** | One track | Commissioned → recorded → mastered → beat grid authored → hand-corrected | 2 days per designer after delivery | 47 |
| **Elements** | One element type | Resolver → judged → animated → audio → tested against the protocol corpus | 1.5 weeks | ~25 |
| **Spin positions** | One variation | Authored → tolerance-tuned → inertia-tuned → groom-safe | 2 days | 19 |
| **Skaters** | One authored rival | Model → groom → persona tuned → signature elements → career arc | 1 week | 24 |

> **The rate is published on a wall.** Every train's actual versus planned is visible to everyone,
> every week. Not to apply pressure — to make a slipping train *visible in week 3* rather than in
> month 8, when the only remaining response is to cut.

### Definition of done matters more than the rate

A rink that is "done except lighting" is not done, and counting it as done is how a project
discovers in month 20 that it has eleven rinks at 85% and no way to finish any of them. Each
train's definition of done above ends in a **signed review**, not a checked box.

---

## 4 · Risk-first ordering

The riskiest remaining work lands in the **first quarter**, not the last. Each of these can still
fail, and failing in month 12 is recoverable in a way that failing in month 21 is not.

| System | Why it is risky | Lands |
| --- | --- | --- |
| **Career loop** | The bible deliberately deferred career economy — training weeks, cost curves, progression pacing — until the moment-to-moment game was proven. **That debt comes due now**, and it is real design work, not tuning. | P1 |
| **Composer v1 UI** | A timeline editor with live rule validation is a genuine product, not a screen. Tools risk is underestimated on every project that has ever shipped. | P1 |
| **Netcode determinism at scale** | The harness proved determinism on 10,000 replays in a controlled build. Proving it across 12 rinks, 40 costumes and every element is a different problem. | P1 |
| **The Patch** | A tutorial for a hard control scheme is the highest-stakes content in the game, and it must be built early enough to be *tested repeatedly*, not shipped on faith. | P1 |
| **The first hour** | Related but distinct. Built early, playtested every quarter with fresh people. The classic failure is building it last and badly. | P1, retested P2–P4 |
| **Warm-up lobby netcode** | Six players, real-time, client-authoritative. Lower risk than pairs, but still the first live multiplayer. | P2 |
| **Balance across five assist tiers** | Five times the balance surface, and nobody schedules it. Starts P2, continuous thereafter. | P2+ |

---

## 5 · The four playable milestones

Every quarter produces a build somebody outside the team plays. This is the antidote to invisible
progress.

### P1 · The Season Slice (W41–52)

**Playable:** one complete career season, start to finish — club competition through nationals,
with training weeks between events, on three rinks.

| Deliverable | |
| --- | --- |
| Career loop v1 | Season structure, training allocation, event calendar, coach relationship |
| Composer v1 | Player-facing timeline with live well-balanced-program and Zayak validation |
| The Patch v1 | School figures tutorial, tracing-scored |
| Netcode | Async competition, server re-simulation, determinism at content scale |
| Content | Rinks 2–4 shipped. 8 costumes. 10 tracks. Men's skater rigged. |
| First hour | Built and playtested with 12 fresh testers |

**Exit:** a tester with no prior exposure completes a season unaided.

### P2 · All Modes (W53–64)

**Playable:** every shipping mode reachable and functional, half the content in.

| Deliverable | |
| --- | --- |
| Modes | Free Skate, Gala, Competition, Warm-Up Group all playable |
| Netcode | Warm-up lobby live, six players |
| Balance | Assist ladder tuned across all five tiers |
| Content | Rinks 5–7. 20 costumes. 24 tracks. 12 rival skaters. |
| Second discipline | Men's singles playable end to end |

**Exit:** no mode is a stub. Anything not finishable is cut here, per §2, not later.

### P3 · Content Complete Candidate (W65–76)

**Playable:** the whole game, all content present, quality uneven.

| Deliverable | |
| --- | --- |
| Content | Rinks 8–12 (or as cut). All costumes. All tracks. All 24 skaters. |
| Composer v2 | Choreographic accents, Gala lighting cues |
| Elements | Full coverage, validated against the 50-element protocol corpus ([level-features.md §7](level-features.md#7--validating-against-reality)) |
| Performance | Within 30% of target on every SKU |

**Exit:** content complete. **The cut list is exercised here if it is going to be exercised at all.**

### P4 · Alpha (W77–88)

**Playable:** feature complete, start to finish, no blockers.

| Deliverable | |
| --- | --- |
| Completion | Every shipping feature present and functional. No stubs, no placeholders. |
| Integration | Full 40-hour play-through clean |
| Determinism | Harness green 30 consecutive nights |
| Performance | Within 20% of target, all SKUs |
| Localisation prep | **Text lock candidate** — see [beta-plan.md §3](beta-plan.md#3--the-text-lock-cascade) |

**Exit:** [the alpha gate](#9--the-alpha-gate).

---

## 6 · Mocap block 3

> **This corrects the bible.** [§08](design-bible.md#08--development-roadmap--risk) places both
> mocap blocks in production. The [vertical slice plan](vertical-slice-plan.md#6--the-mocap-blocks)
> moved them to W20 and W30, because a slice at ship quality cannot be animated from placeholder
> data. Production therefore needs a **third, smaller block** rather than the first two.

| | Block 3 · W56 |
| --- | --- |
| **Content** | Gala and choreographic movements, career cinematics, Kiss & Cry performances, additional spin variations, pickups from blocks 1 and 2 |
| **Method** | Optical volume, three days |
| **Clips** | ~350 |
| **Why W56** | Late enough that blocks 1 and 2 have revealed their gaps; early enough that integration finishes before P3 content lock. |

Budget a pickup day in W70 for anything blocks 1–3 missed. It is always needed, and holding the
slot is cheaper than negotiating for one.

---

## 7 · Cadence

| When | Ritual |
| --- | --- |
| **Daily** | Automated build, determinism harness, performance capture on every SKU. Red build blocks merges. |
| **Wednesday** | **The Session** continues from pre-production — the whole team plays the current build, in silence, then discusses. At 38 people this splits into four rooms of ten with rotating membership. Non-negotiable. |
| **Weekly** | Content train review. Actual versus planned, on the wall, fifteen minutes. |
| **Monthly** | Playable build to an external group of 8–12. Different people every time. |
| **Quarterly** | Milestone review against P1–P4 exit criteria, plus a cut-list check: are we on rate, and if not, what comes off? |

---

## 8 · The W40 recalculation

**Run this in the green-light week, before production starts.** It replaces every placeholder in
§3 and re-derives the cut line.

```
For each content train:
    measured_rate  = slice actual (person-weeks per unit, from Gate C1)
    variance       = spread across repeated units
    planning_rate  = measured_rate × (1 + variance)      ← plan on the pessimistic figure

    demand         = units_remaining × planning_rate
    supply         = assigned_headcount × 48 weeks × 0.75  ← 0.75 for meetings,
                                                             sickness, support work

    if demand > supply × 0.85:                            ← 15% contingency
        cut from the bottom of §2 until it fits
```

Three things this arithmetic must be allowed to say:

1. **Plan on `measured × (1 + variance)`, never the mean.** A rink that took 9 weeks once and 13
   weeks the second time is a 13-week rink for planning purposes.
2. **The 0.75 utilisation factor is not pessimism, it is observation.** Nobody delivers 40 hours
   of train work in a 40-hour week.
3. **If the answer is "cut to discipline-level" (item 7 on the cut list), say so in week 40.**
   That is a different, smaller game, and it is a legitimate one — but it must be decided at the
   gate, with the publisher in the room, not discovered in month 20.

---

## 9 · The alpha gate

Alpha is the most abused word in game production. Here it means exactly six things, all measured,
signed in W84 before the data exists.

| # | Criterion | Threshold |
| --- | --- | --- |
| 1 | **Feature complete** | Every shipping feature present and functional. Zero stubs. A feature that is "in but disabled" is not in. |
| 2 | **Playable start to finish** | Three testers each complete a full career, unaided, with no blocking defect |
| 3 | **Content complete at first pass or better** | No grey boxes, no placeholder audio, no untextured assets in shipping content |
| 4 | **Determinism** | Harness green for **30 consecutive nights** across every target platform |
| 5 | **Performance** | Within **20%** of target frame rate on every SKU, worst-case scene |
| 6 | **Endurance** | A 40-hour aggregate play-through produces zero crashes and zero progression blockers |

### Decision rule

| Outcome | Condition | Action |
| --- | --- | --- |
| **GREEN** | All six | Enter beta W89. Text lock scheduled. |
| **AMBER** | 4–5 of six, none of them criterion 1 or 2 | Four-week alpha extension, pre-authorised, once. Beta compresses by four weeks and the launch date holds — **this is what beta's float is for**. |
| **RED** | Criterion 1 or 2 fails, or three or more fail | Feature complete is not negotiable. Cut features until criterion 1 is true, using §2. Re-gate in six weeks. A project that enters beta without being feature complete does not have a beta; it has a longer production wearing beta's name. |

---

## 10 · Risks

| # | Risk | P | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Invisible progress.** Twelve months of work with no external eyes, ending in an alpha nobody can play. | High | Fatal | Quarterly playable milestones with external testers. Monthly builds to fresh groups. The content wall. |
| 2 | **Content trains slip quietly.** A four-week rink becomes a six-week rink and nobody notices for four months. | **High** | Major | Published rates, weekly actual-versus-planned, re-measurement every four weeks. Definition of done ends in a signed review. |
| 3 | **The cut list is never used.** Everyone agrees it exists and nobody invokes it, so the cut happens by panic in month 21. | High | Major | Quarterly cut-list check is a formal milestone agenda item with a yes/no answer. P3 is the last honest moment to cut. |
| 4 | **Career economy is underestimated.** It was deliberately deferred and is now real design work with no prior art in the project. | Med | Major | Lands in P1, not P3. Two designers, twelve weeks, with an explicit "this may need a second pass" allowance. |
| 5 | **The first hour is built last.** A hard simulation with a bad first hour reviews badly regardless of its depth. | Med | **Major** | Built in P1, retested with fresh testers every quarter. Treated as a content train, not a task. |
| 6 | **Tools debt.** The Composer's editor is a product; treating it as a screen produces something the team cannot use to build content with. | Med | Major | Dedicated tools engineer from W41. The content team are its first users and their throughput is the acceptance test. |
| 7 | **Five assist tiers, five balance problems.** | Med | Moderate | Balance starts P2, not P4. Each tier gets its own playtest cohort. |
| 8 | **Attrition.** Twelve months is long enough to lose people, and the sim core has a bus factor of two. | Med | Major | Documented architecture (this repo), pairing on the sim core, no single-owner systems by P2. |

---

## 11 · Budget

| Line | Cost |
| --- | --- |
| 38 FTE × 12 months, loaded | $5,472,000 |
| Mocap block 3 + W70 pickup day | $75,000 |
| Music: remaining commissions, orchestra, recording | $210,000 |
| Outsourced art (environment and costume support) | $340,000 |
| Licensed music (4 tracks, sync + master) | $180,000 |
| Playtesting: 4 quarterly waves + 12 monthly builds | $52,000 |
| Backend infrastructure (async ghosts, leaderboards) | $60,000 |
| Hardware, dev kits, licences | $80,000 |
| **Total** | **~$6,469,000** |

Loaded at ~$12k per person-month, consistent with the earlier phases. Cumulative through alpha,
including pre-production and slice: **~$8.9M**.

> Licensed music is the one line that can be deleted entirely without touching the game, and it is
> deliberately the last thing committed — see [bible §5.2](design-bible.md#52-music). If the budget
> tightens, four licensed tracks are $180k of pure marketing spend with an expiry date attached.

---

*Content volumes here are provisional until the [W40 recalculation](#8--the-w40-recalculation).
The structure is not. Next phase: [beta-plan.md](beta-plan.md).*
