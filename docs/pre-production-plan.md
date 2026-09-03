# Pre-production: The Feel Prototype

**16 weeks · 8 FTE · one question.**

Pre-production on Edgework is not "build a small version of the game." It exists to answer
a single question that the entire project rests on, and to answer it cheaply enough that a
"no" is survivable.

> ## Is carving fun with no jumps, no score and no art?

No shipped game has used analog lean plus analog knee pressure as its primary verb
([bible §2.1](design-bible.md#21-control-mapping), [risk 1](design-bible.md#risk-register)).
If the answer is no, no amount of costume rendering, judging fidelity or career structure
rescues it. Everything else in the bible is downstream of this.

The plan below is built so that a "no" arrives in **week 16 for ~$470k**, rather than in
month 22 for eight million.

---

## Contents

1. [Scope discipline](#1-scope-discipline)
2. [The team](#2-the-team)
3. [Three control schemes](#3-three-control-schemes)
4. [Week-by-week](#4-week-by-week)
5. [Parallel tracks](#5-parallel-tracks)
6. [Telemetry](#6-telemetry)
7. [The playtest protocol](#7-the-playtest-protocol)
8. [The kill gate](#8-the-kill-gate)
9. [How this gate could give a wrong answer](#9-how-this-gate-could-give-a-wrong-answer)
10. [Budget](#10-budget)
11. [Weekly cadence](#11-weekly-cadence)

---

## 1 · Scope discipline

Most pre-productions fail by building a small version of everything. This one builds the
**feedback channels and nothing else** — because the question is about how the verb *feels*,
and feel is what the player perceives, not what the simulation computes.

### We build

| Thing | Why it is in scope |
| --- | --- |
| **The carve solver** | It is the thing under test. |
| **The balance model**, stumble and fall | Failure is half of feel. A verb you cannot fail is not being tested. |
| **Blade tracings** (§09B v0) | ~1 week of work, and it is the primary *visual* channel for edge quality. Testing carving without visible tracings under-tests the concept. |
| **Edge tone audio** (§5.3) | The bible calls this the player's primary feedback channel for edge quality. Testing feel in silence is testing the wrong thing. A crude version — one filtered noise bed plus one resonant partial — is three days. |
| **Procedural lean** (§3.3) | A capsule that stacks over its edge correctly feels different from one that tips. This is feel engineering, not art. |
| **The Edge Ribbon** (§4.6) | The only HUD element that ships. It is under test too. |
| **The load-release hop** | From week 9 only, and deliberately not a jump — see below. |
| **Telemetry / replay recording** | Because the gate must be decided on data. Doubles as the §6.3 replay system, built once. |

### We refuse to build

Jumps as elements · rotation · scoring · judges · any named element · music · characters
(a capsule with a blade) · costumes · cloth · hair · an arena (a plane, a boards ring, a
grid) · menus · AI · netcode · career · the Composer · mocap.

> **The hop is not a jump.** From week 9 the prototype gets a load-release vertical hop with
> no rotation, no element identity and no scoring. The load/release trigger shares its input
> channel with carving, so it has to be tested — but it arrives *after* carving has been
> evaluated alone, so that an exciting jump cannot rescue a boring foundation. If carving
> only works because jumping is exciting, the shipped game is 90% tedious connective tissue.

---

## 2 · The team

Eight people. Every one of them plays the build every week, including the producer.

| Role | FTE | Owns |
| --- | --- | --- |
| **Creative lead / director** | 1 | The question. Runs the daily play session. **Recused from the gate vote** (see §8). |
| **Gameplay engineer — solver** | 1 | `FSkateSolver`, blade contact, ice grid, friction and bite curves. |
| **Gameplay engineer — input & feel** | 1 | The three control schemes, the balance model, the hop, the telemetry pipeline. |
| **Rendering / technical artist** | 1 | Engine spike: ice material, tracing RVT, planar reflection cost. Answers D2 with evidence. |
| **Animation engineer** | 1 | Placeholder rig, procedural lean layer, blade IK, powered-ragdoll falls. No authored animation. |
| **Designer** | 1 | Control scheme specification, test tasks, the playtest protocol, the scoring data model. |
| **Producer** | 1 | Hiring, mocap vendor and volume booking, schedule, budget, tester recruitment. |
| **Skating consultant** | 1 | Permanent hire from week 1, per [bible §08](design-bible.md#team-composition-at-production-peak). Holds an **authenticity veto**: if the consultant says "that is not what that feels like," it is a bug, not a preference. |

**Contracted:** audio designer (~3 weeks, the edge-tone layer), concept artist (~4 weeks,
style pillars, weeks 9–16).

---

## 3 · Three control schemes

[Risk 1](design-bible.md#risk-register) requires two fallbacks prototyped, not one. These
deliberately **span the space** rather than clustering around variations of the same idea —
one is the bible's proposal, one is safer and conventional, one is stranger and higher-ceiling.
All three sit behind a runtime toggle and are labelled **A / B / C** in every test, never
"the real one."

### Scheme A — *Lean & Load* (the bible's proposal)

| Input | Function |
| --- | --- |
| Left stick | Lean vector: direction and magnitude, 0–65° |
| RT (analog) | Knee pressure / load |
| Right stick | Carriage — upper body, arms, checking |
| LT (analog) | Free leg / toe pick |

Highest ceiling, highest risk. Three simultaneous continuous analog channels is more than
most players carry. **This is the hypothesis under test.**

### Scheme B — *Steer & Load* (the safe fallback)

Left stick becomes intended travel direction, as in any third-person game. The solver picks
whichever edge curves that way, and lean magnitude is derived from turn demand and speed. RT
still loads the knee.

Keeps: the carve physics, the emergent radius, the load-release takeoff, the whole
simulation. Loses: deliberate inside/outside edge choice, which is the sport's actual
alphabet. This is the bible's Club assist tier promoted to the default control scheme.

**If B beats A, the game is still viable** — it is a less expressive game with a lower
ceiling, and §2.1, §2.3 and the assist ladder need rewriting.

### Scheme C — *Two-Foot* (the strange one)

Left stick controls the left blade's edge, right stick the right blade's. Maps directly onto
crossovers, mohawks and choctaws, which are inherently two-foot actions.

Possibly unlearnable. Possibly the most distinctive control scheme in any sports game. Worth
four weeks of an engineer's time to find out, because if it works the game becomes much
harder to copy.

> **Down-select from three to two at week 8**, from two to one at week 12. Only one scheme
> goes into the gate build, but the runner-up stays compiled and playable so that an AMBER
> outcome (§8) has somewhere to go on day one rather than after a month of rebuilding.

---

## 4 · Week-by-week

Weeks are relative to project start. Calendar anchoring is the producer's.

### Month 1 · The blade on ice

| Week | Deliverable |
| --- | --- |
| **W1** | Repo, CI, build farm. Skating consultant starts. Engine spike begins in **both** UE5 and Unity — a carve on a plane, an ice material, a tracing RVT — timeboxed to two weeks. |
| **W2** | **M1.1 — Engine decision locked** ([D2](open-decisions.md#d2--engine)). Decided on spike evidence plus team fluency, and not revisited. Every week D2 stays open costs two engineers half their throughput. |
| **W3** | Solver v0: one foot, lean → carve, longitudinal friction. Capsule with a blade on an infinite plane. Debug camera. No balance, no second foot. |
| **W4** | **M1.2 — You can carve a circle, and its radius changes with lean.** Internal only. Nobody outside the room sees this. First telemetry: lean, speed, radius, skid, logged per tick. |

### Month 2 · Three schemes, one question

| Week | Deliverable |
| --- | --- |
| **W5** | Solver v1: two feet, edge switching, stroking, crossovers, the skid threshold. Ice grid with damage and snow. |
| **W6** | Tracings v0 — contact points accumulating into a render target driving the ice material. Edge tone audio v0 from the contracted designer. |
| **W7** | All three control schemes implemented behind a runtime toggle. Procedural lean layer online. |
| **W8** | **M2 — Internal Feel Review.** Eight team members plus eight friendly externals, blind A/B/C, ranked. **Soft gate: down-select 3 → 2.** Not a kill gate; a scheme selection. |

### Month 3 · Depth and the hop

| Week | Deliverable |
| --- | --- |
| **W9** | Balance model, stumble, fall, powered-ragdoll v0. The load-release hop — no rotation, no element identity, no score. |
| **W10** | The **Figure Eight** and **Slalom** courses built as instrumented, repeatable tasks. Telemetry pipeline complete and dashboarded. |
| **W11** | Both surviving schemes refined against internal telemetry. Edge Ribbon v1. Tuning pass on bite curves with the consultant. |
| **W12** | **M3 — Learning curve demonstrated internally.** Telemetry must show measurable improvement across attempts for at least the team. Then: **down-select 2 → 1, and freeze the gate build.** No code changes after this point except crash fixes. |

### Month 4 · The gate

| Week | Deliverable |
| --- | --- |
| **W13** | **Protocol pilot** with four testers. Purpose is to debug the *protocol*, not the game — script timing, task legibility, telemetry capture, facilitator consistency. Pilot data is discarded. |
| **W14–15** | **20 testers × 2 sessions.** Ten testers per week, sessions 3–7 days apart. |
| **W16** | Analysis, written report, **gate decision**, postmortem regardless of outcome. |

---

## 5 · Parallel tracks

These run independently of the gate answer and are mostly the producer's. They exist so that
a GREEN decision in week 16 means the vertical slice starts in week 17, not week 25.

| Track | Weeks | Output |
| --- | --- | --- |
| **Mocap planning** | W5–W16 | Vendor selected, IMU and optical volume quoted, harness rig designed, skaters cast and auditioned, ~1,500-clip shot list drafted, **volume provisionally booked for W20**. Cancellable with a deposit. |
| **Scoring data model** | W5–W10 | Already begun — see [`data/`](../data/). Complete the spin and step **level-feature** enumeration, the one gap blocking the judging pipeline. |
| **Style pillars** | W9–W16 | Contracted concept artist: eight images. Not for the gate build, which stays untextured. For the funding conversation that follows a GREEN. |
| **Vertical slice plan** | W13–W16 | Written *before* the gate result is known, so it is not motivated reasoning. Staffing, the 22-person ramp, the one-rink scope. |

> The mocap booking is the only genuinely irreversible parallel commitment. Book it with a
> cancellation clause and accept losing the deposit on a RED. Losing a deposit is much cheaper
> than losing eight weeks of schedule waiting for a volume after a GREEN.

---

## 6 · Telemetry

**Build the replay recorder from [§6.3](design-bible.md#63-networking) now, not in production.**
It is the same system: a deterministic input stream plus periodic state keyframes. In
pre-production it is the instrument; in production it is ghosts, verification and the Composer.
Built once.

Captured per tick: input state, `FSkaterState`, edge sign, lean, skid flag, contact point.
Roughly 4 KB/s — a full session is a few megabytes.

Derived per session:

| Metric | Definition | What it tells you |
| --- | --- | --- |
| **Free-play duration** | Seconds of voluntary play after "stop whenever you like" | The headline. Nothing else is close. |
| **Figure-eight deviation** | RMS distance of the tracing from the reference curve, metres | The skill metric. Repeatable, objective, and it is the shipping tutorial. |
| **Skid ratio** | Fraction of ticks where the edge let go | Falls as skill rises. A flat line means no learning. |
| **Mean lean depth** | Mean of \|lean\| while moving | Rises with confidence. The single best proxy for "they trust the physics." |
| **Edge changes / minute** | Signed edge transitions | Rises with vocabulary. Distinguishes exploring from surviving. |
| **Time-to-retry** | Seconds from fall to next input | Under 3 s means the failure felt fair. |
| **Unprompted actions** | Attempted behaviours nobody asked for | Manually coded from video. The mastery signal. |

---

## 7 · The playtest protocol

### Recruitment

Twenty external testers, screened into four segments so a wrong-audience result is visible
rather than hidden in an average:

| Segment | n | Profile |
| --- | --- | --- |
| Sim-curious | 8 | Plays *Trials*, *Skate*, soulslikes. The primary audience. |
| General gamers | 6 | No particular affinity. The breadth check. |
| Skating fans | 4 | Watches or skates. Any gaming level. |
| Skaters who barely game | 2 | The authenticity check. Their verbatims matter more than their scores. |

**Excluded:** game developers, anyone who knows the team, anyone who has heard the pitch.
Both sessions are paid **up front**, so returning is not a financial decision and attendance
is not mistaken for enthusiasm.

### Session 1 — 60 minutes

| Min | Block | Notes |
| --- | --- | --- |
| 0–5 | Consent, framing | Described only as "an ice skating prototype." No pitch, no pillars, no mention of what it is trying to be. |
| 5–10 | **Cold hands** | Controller handed over, facilitator says nothing. Record what they try first and how long before they ask a question. |
| 10–20 | Scripted tutorial | Read verbatim from a card so all twenty get the same words. |
| 20–35 | **Figure Eight ×10** | Instrumented. Deviation, time, skids per attempt. |
| 35–45 | **Slalom ×5** | Alternating lobes under time pressure. |
| 45–55 | **Free play** | *"The rink is yours. Stop whenever you like."* Timer runs; they are not told it is measured. |
| 55–60 | Exit questions | Below. |

### Session 2 — 60 minutes, 3–7 days later

| Min | Block | Notes |
| --- | --- | --- |
| 0–5 | **Cold retention** | No re-tutorial, no reminders. Can they still do it? This separates a scheme that is *learnable* from one that is merely *followable while being told*. |
| 5–20 | Figure Eight ×10 | Compared against session 1. |
| 20–30 | Slalom ×5 | |
| 30–50 | **Free play, 20 minutes available** | Same instruction. **The headline metric**, now that novelty has worn off. |
| 50–60 | Exit interview | |

### Exit questions

Only five. Forced choice where possible, because Likert scales invite politeness.

1. *"When you fell, was that you or the game?"* — **attribution.** A good hard game makes
   players blame themselves.
2. *"What were you trying to do that you could not?"* — reveals whether the ceiling is
   perceived as depth or as an obstruction.
3. *"Describe the feeling of a good turn to someone who has not played it."* — if they can,
   the verb is legible. Verbatims from this question are the best marketing copy you will get.
4. *"Would you rather play this again next week, or [named comparable game]?"* — forced choice.
5. *"Is there anything you want to ask us?"* — unprompted requests for a build are logged.
   Never solicited.

### Facilitator rules

- Never say the word "fun."
- Never explain a failure during a measured block. Not once.
- Never defend the prototype.
- Log every unprompted utterance verbatim, including swearing — sworn delight and sworn
  frustration are the two most informative data points you will collect.
- Two observers minimum: one on video and verbatims, one on telemetry.
- Schemes are labelled A/B/C to the testers **and to the observers**.

---

## 8 · The kill gate

### Pre-committed thresholds

**These are signed off by the decision-maker in week 12, before any external data exists.**
Writing thresholds after seeing results is how kill gates become theatre.

#### Must pass — all three

| # | Criterion | Threshold | Why this number |
| --- | --- | --- | --- |
| **1** | **Voluntary free play, session 2** | Median ≥ 8 minutes of the 20 available | Eight minutes of self-directed play with no goals, no score, no art and no novelty is a strong signal that the verb carries itself. |
| **2** | **Skill improves** | Median figure-eight deviation improves ≥ 35% from attempt 1 to attempt 20 (across both sessions) | A verb with no measurable learning curve has no mastery ladder, and mastery is the entire product. |
| **3** | **Failure feels fair** | ≥ 70% answer "me" to the attribution question, **and** median time-to-retry < 3 s | If falling feels like the game's fault, every hard element in the shipped game will feel unfair. |

#### Signal — informative, not fatal

| # | Criterion | Target |
| --- | --- | --- |
| 4 | Unprompted experimentation in free play | ≥ 50% of testers attempt something nobody asked for |
| 5 | Unprompted requests for a build or a release date | ≥ 6 of 20 |
| 6 | Ceiling not reached | The strongest tester is still improving at the end of session 2 |
| 7 | Cross-segment consistency | No segment's median free-play under 4 minutes |

### Decision rule

| Outcome | Condition | Pre-committed action |
| --- | --- | --- |
| **GREEN** | All three must-pass met | Proceed to vertical slice on the winning scheme. Week 17 starts. Confirm the mocap booking. |
| **AMBER** | Two of three met, **or** all three met on a fallback scheme but not on A | **One** six-week extension, single scheme, re-test with 12 testers against the same thresholds. If A failed and B passed, the bible's §2.1, §2.3 and assist ladder are rewritten around B before the slice begins. |
| **RED** | One or fewer met | **Stop.** Do not proceed to the vertical slice. Write the postmortem, publish the data, and either pivot the concept or return the remaining money. |

Two rules that make this real:

- **The extension can be taken once.** Its ~$150k is approved in week 12 as part of the gate
  sign-off, so that invoking it is a pre-authorised branch and not a political act.
- **The decision-maker is not the person who invented the control scheme.** The creative lead
  presents nothing and does not vote. The designer presents the data; the studio head or an
  external advisor decides. Sunk cost beats judgement every time it is allowed to.

---

## 9 · How this gate could give a wrong answer

A gate you have not tried to break is a ritual. Four failure modes, each with a mitigation
built into the protocol above.

| Failure mode | Mechanism | Mitigation |
| --- | --- | --- |
| **False positive — novelty** | Tracings are genuinely novel and pretty. Testers enjoy *drawing on ice*, not *carving*, and the team ships a game with one good screenshot. | Session 2 free play is the headline metric precisely because novelty has decayed. Criterion 2 requires demonstrated skill growth, which novelty cannot fake. |
| **False positive — politeness** | Testers are in a room with the people who made it and want to be kind. | Forced-choice exit questions. Behavioural metrics outrank every stated preference. Facilitators never signal what a good answer looks like. |
| **False negative — jank** | Testers reject an untextured capsule on a grey plane and the team reads it as rejecting the verb. | The three feedback channels ship (tracings, edge tone, procedural lean). Exit question 2 separates "how it looked" from "how it responded," and any tester who cites presentation is flagged in the analysis. |
| **False negative — wrong twenty people** | The sample simply is not the audience. | Four screened segments, reported separately. Criterion 7 exists to make a segment split visible rather than averaged away. |

**One thing this gate deliberately does not test:** whether a *four-minute judged program*
is compelling. That question needs elements, scoring, music and stakes, and it belongs to the
vertical slice's exit gate. Pre-production tests the verb. Do not let scope creep in under the
argument that "we should check the whole loop" — that is a twelve-month prototype, and the
whole point is to fail cheaply.

---

## 10 · Budget

| Line | Cost |
| --- | --- |
| 8 FTE × 4 months (loaded, mid-cost market) | $384,000 |
| Contract audio designer (~3 weeks) | $15,000 |
| Contract concept artist (~4 weeks) | $20,000 |
| Playtesting — 20 testers × 2 sessions, facility, video | $9,000 |
| Mocap planning, casting, refundable volume deposit | $15,000 |
| Hardware, licences, build infrastructure | $25,000 |
| **Total** | **~$468,000** |
| *Pre-authorised AMBER extension (6 weeks, conditional)* | *~$150,000* |

Loaded cost assumed at ~$12k per person-month. Scale to your market; the ratios hold, and the
FTE line dominates in every market.

---

## 11 · Weekly cadence

| When | Ritual |
| --- | --- |
| **Monday** | Build lock for the week. Whatever is in at 10:00 is what gets played. |
| **Wednesday** | **The Session.** All eight play the current build for 30 minutes in the same room, in silence. Then 30 minutes of discussion. The producer and the consultant play too — no exceptions, no observers. |
| **Thursday** | Consultant review: one authenticity note per week, escalated as a bug. |
| **Friday** | Telemetry review against the internal learning-curve trend. Fifteen minutes, dashboard only, no slides. |

Silence during play matters. The moment someone narrates what the build is *supposed* to do,
you stop measuring the build and start measuring the explanation — which is the same reason
the facilitator script exists in §7.

---

## What GREEN unlocks

Week 17 begins the vertical slice: one rink at ship quality, one skater with full costume,
cloth and groom, one complete 2:40 short program containing every element category, the
nine-judge panel, the Broadcast Director, the Wwise blade layer, and the Kiss & Cry. Twenty-two
people, six months, and an exit gate of its own — *a stranger plays for twenty minutes and asks
when it ships.*

Planned in full in [vertical-slice-plan.md](vertical-slice-plan.md); summarised in
[bible §08](design-bible.md#08--development-roadmap--risk).

---

*Thresholds in §8 are pre-commitments and must be signed before week 13. Open project-level
decisions are tracked in [open-decisions.md](open-decisions.md); note that [D2](open-decisions.md#d2--engine)
must close in week 2 of this plan.*
