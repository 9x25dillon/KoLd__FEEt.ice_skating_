# Open decisions

Six choices that change the shape of the project, plus the smaller specification gaps
that are known and deliberately unfilled. Each has a defensible default so work is never
blocked — but these are the calls that are expensive to reverse later.

Resolve one by editing its **Status** line to `RESOLVED — <choice> (<date>)` and, where
it matters, updating the affected sections of `design-bible.md`.

---

## D1 · Budget and team size

**Default:** ~40 FTE at production peak over 30 months, roughly $18–25M.

**Status:** OPEN

If the real number is 12–15 people: cut to one discipline, four rinks, no career mode, and
lead with Free Skate plus the Composer as a premium indie. The simulation core, the tracing
system and the scoring pipeline survive intact — it is the *content* that scales down. This
is the only part of the bible that scales cleanly, and it scales well.

**Affects:** §08 entirely, §01 content scope, §04 arena list.

---

## D2 · Engine

**Default:** Unreal Engine 5.4+.

**Status:** RESOLVED — **Unreal Engine 5.4+ (2026-09-03).** Closed ahead of pre-production
rather than at the week-2 deadline, which is the best possible outcome for this decision: it was
the only item on the register with a hard date, and every week it stayed open cost two engineers
half their throughput.

The recommendation rested on MetaHuman, Chaos Cloth, Groom, Pose Search and Sequencer — the
character, costume, animation and cinematic pipeline, which is most of this game. Unity's genuine
advantages, iteration speed and crowd performance, were judged not to outweigh that.

### Consequences now locked

- **The engine bake-off is cancelled.** Weeks 1–2 of pre-production no longer run a two-engine
  spike. What remains is a single-engine *validation* spike in UE5 — the ice material, the tracing
  RVT, planar reflection cost — and M1.1 changes from "decide the engine" to "prove the ice
  renders." See [pre-production-plan.md](pre-production-plan.md#month-1--the-blade-on-ice).
- **`USkateMovementComponent`, not `CharacterMovementComponent`.** The bible's warning
  ([§6.1](design-bible.md#61-engine-recommendation-unreal-engine-54)) is now a standing
  instruction rather than a contingent one. CMC's assumptions are all wrong for a carve model.
- **The reference code's Unreal flavour is now literal**, not illustrative. `F` prefixes,
  `FVector`, `TArray` — the samples in `src/reference/` are the intended idiom.
- **`ScoreCalculator.cs` is the one exception** and stays C#: scoring runs headlessly in the
  server-side verification path, where a managed implementation is the more convenient host.
  Port it to C++ only if the verification service ends up in-engine.
- **Licensing:** Unreal's royalty terms apply above the revenue threshold. Model that in the
  P&L before the vertical slice gate, not after — it changes the break-even, not the plan.

**Was affected:** §06 entirely, §10 code samples, §03.3 animation approach. All now consistent.

---

## D3 · Multiplayer at launch

**Default:** Single-player first. Async competition and the six-player Warm-Up Group ship at
launch; pairs and ice dance are the year-one expansion.

**Status:** OPEN

If real-time competitive multiplayer is a launch requirement, add a senior network engineer
from month one and expect the pairs constraint solver to become a critical-path item rather
than an expansion. Note that singles competition has no simultaneous play at all — this is
the single largest piece of free luck in the project and the architecture should keep
exploiting it.

**Affects:** §06.3, §08 team composition and phasing.

---

## D4 · Where the difficulty default sits

**Default was:** Novice tier is the out-of-box default; Senior is the intended experience.

**Status:** RESOLVED — **adaptive routing, sim-first positioning (2026-09-03).**

Neither of the two options this entry originally offered. **The Patch recommends a tier from the
player's own tracing score**, with Novice as the fallback when the tutorial is skipped.
Positioning stays sim-first and unambiguous — the game is still balanced, marketed and reviewed
around Senior — but the onboarding adapts instead of guessing.

### Why this beats a fixed default

The Patch already scores the player's figure-eight tracing against a reference curve by distance
transform. **That number was being thrown away after grading.** Using it costs roughly two weeks
of design and directly attacks the failure mode a hard simulation is most exposed to: the wrong
player bouncing in hour one, never having found the tier list at all.

### The design, and its four guardrails

Parameters live in [`data/assist-tiers.json`](../data/assist-tiers.json).

| Tracing RMS deviation | Recommends |
| --- | --- |
| under 0.35 m | Senior |
| 0.35 – 0.90 m | Novice |
| over 0.90 m | Club |

1. **It only spans the middle three tiers.** Show is never auto-assigned — it is a deliberate
   accessibility choice a player makes for themselves, and routing someone there on the strength
   of one tutorial reads as a verdict rather than a suggestion. Patch tier is chosen, never
   assigned.
2. **It recommends; it never imposes.** Override is one input, always available, never buried.
3. **It must explain itself, using the player's own line.** *"Your edges held clean but the lobes
   drifted wide."* The recommendation overlays their tracing on the reference, which turns a
   judgement into a teaching moment — and is only possible because the tracing exists.
4. **It is allowed to be wrong once, and to say so.** Six falls in the first program offers a step
   down; three clean programs offers a step up. Offered, never applied. Once per career, so it
   cannot nag.

### Consequences

- **Lands in production P1**, alongside The Patch v1 and the first-hour work — not in the vertical
  slice, which does not build a tutorial. The slice's Gate B playtest runs at the **Novice**
  fallback.
- **New beta metric: router accuracy**, measured in wave 1 as `1 − override rate within the first
  hour`, target ≥ 0.75. A router overridden by half its players is *worse* than a fixed default,
  because it has spent the player's trust to arrive at the same place.
- Assist tier parameters move out of the bible's table and into data, where they can be tuned
  across five cohorts in beta.

**Affects:** §02.1 assist ladder, §04.6 UI, §01 The Patch, production P1, beta wave 1.

---

## D5 · Disciplines at launch

**Default:** Men's and women's singles only.

**Status:** OPEN

Adding pairs or ice dance at launch is roughly +8 months and a second animation team.
Synchronised skating is a different game and is out of scope in any scenario.

**Affects:** §01 modes, §08 scope and risk 6.

---

## D6 · Licensed athletes and federations

**Default:** No. Original skaters only.

**Status:** RESOLVED — original skaters, no licensing at launch (2026-09-02)

Licensing constrains the career fiction, adds legal review to every content drop, delays
announcement, and buys almost nothing this game needs. Revisit only as post-launch DLC once
the game exists and has leverage.

**Affects:** §01, §07.1, §08 risk 9.

---

# Known specification gaps

Smaller than the above, and none of them block starting. Listed so they are not rediscovered
as surprises.

| Gap | Where it bites | Notes |
| --- | --- | --- |
| ~~**Spin and step level features** are not enumerated~~ | — | **CLOSED 2026-09-02.** Specified in [level-features.md](level-features.md), data in `data/spin-features.json`, `step-features.json`, `spin-positions.json`, detection in `src/reference/SpinResolver.cpp`. Two follow-ons remain: verify the feature lists against the current ISU Communication, and build the 50-element protocol validation corpus (vertical slice, needs Composer v0). |
| ~~**The Composer transition solver** is specified in outline only~~ | — | **CLOSED 2026-09-02.** Specified in [composer-solver.md](composer-solver.md). Note it corrects the bible: the search is over a motion-primitive lattice in physics space, not over the motion-matching database. |
| **Balance model tuning constants** are placeholders | `SkateSolver.cpp`, `kBalanceGain` | Cannot be derived; must come from the feel prototype in months 1–4. |
| **Crowd reaction propagation** timing is unspecified | §07.3 | Per-agent delay curve for the reaction wave. Cheap to tune late. |
| **Career economy** — training weeks, cost curves, progression pacing | §01 The Season | Deliberately deferred until the moment-to-moment game is proven. Designing progression before the verb is fun is a classic way to waste six months. |
| **Ice temperature and hardness** as a career variable | §03.2, §04.4 | The model supports it (`Ice.BiteCoefficient`, outdoor rinks) but no career-facing system uses it yet. Optional depth. |

---

# The one gate that matters

Everything above is a preference. **The month-four kill gate is not.**

> Is carving fun with no jumps, no score, and no art?

Twenty external testers, two sessions each, on a programmer-art build with nothing but the
solver and the balance model. If the answer is no, the correct action is to stop or to
switch to one of the two prototyped fallback control schemes — not to add features and hope.
No amount of costume rendering, judging fidelity or career structure rescues a verb that
does not feel good.
