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

**Status:** OPEN — **must close by week 2 of pre-production.** This is the only decision here
with a hard deadline. A two-week spike in both engines (carve on a plane, ice material, tracing
RVT) runs in week 1; the call is made on that evidence plus team fluency in week 2 and is not
revisited. See [pre-production-plan.md](pre-production-plan.md#month-1--the-blade-on-ice).

The recommendation rests on MetaHuman, Chaos Cloth, Groom, Pose Search and Sequencer — the
character, costume, animation and cinematic pipeline, which is most of this game. Unity wins
iteration speed and crowd performance and is entirely workable, but you rebuild motion
matching, cloth and the character pipeline: budget six extra months and one more animation
engineer.

**The deciding question is not which engine is better, it is what the team already knows.**
A senior Unity team should probably stay on Unity.

**Affects:** §06 entirely, §10 code samples, §03.3 animation approach.

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

**Default:** Novice tier is the out-of-box default; Senior is the intended experience.

**Status:** OPEN

If the target is broad and casual, invert it — Club becomes the default and the Edge Ribbon
needs a much louder, more prescriptive design. This changes the tutorial, the camera, and the
entire first hour of the game. It is a positioning decision more than a design one, and it
should be made before the vertical slice, not after.

**Affects:** §02.1 assist ladder, §04.6 UI, §01 target audience.

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
| **Spin and step level features** are not enumerated | `FSpinResolver` feature detection, `data/` | The criteria that raise an element from level 1 to level 4. Needs a structured format, not CSV. Required before the vertical slice's judging pipeline is complete. |
| **The Composer transition solver** is specified in outline only | §09A | An A* search over the motion-matching database constrained by the physics solver. This is the piece with the most hidden complexity in the whole design and deserves its own document. |
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
