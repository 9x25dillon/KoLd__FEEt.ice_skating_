# Level features: spins and step sequences

**Closes the one gap that blocked the judging pipeline.**

Spins and step sequences do not have a fixed base value. They have a **level**, 1 to 4 (or
B for basic), and the level is earned by accumulating *features* — specific things the skater
did during the element. A level-4 combination spin is worth 3.50; a level-1 is worth 1.70.
Getting this wrong misprices half the technical score.

This document specifies how the simulation detects those features. The companion data lives in
[`data/spin-features.json`](../data/spin-features.json),
[`data/step-features.json`](../data/step-features.json) and
[`data/spin-positions.json`](../data/spin-positions.json); the detection reference is
[`src/reference/SpinResolver.cpp`](../src/reference/SpinResolver.cpp).

> **The feature lists are data and are not yet verified.** They are a faithful, implementable
> model of the ISU system, not a transcription of the current Communication. Verify before
> content lock. **The architecture below is the durable part**; the lists are a seasonal patch.

---

## 1 · The problem this solves

A rule like *"difficult variation of a basic position"* is not something a physics simulation
can observe. It is a human classifying a body configuration. Neither is *"variety of turns,"*
which is a technical specialist's judgement about breadth.

Meanwhile, rules like *"eight revolutions without a change of position, foot, edge or
variation"* are trivially observable and would be absurd to author by hand.

The system therefore splits every feature into one of two kinds, and the split is what makes
the whole thing tractable.

| Kind | Difficulty comes from | The simulation's job |
| --- | --- | --- |
| **Declared** | An authored asset carries a `difficult: true` flag — a position, an entry, an exit | **Verify it was attained and held.** Never classify. |
| **Observed** | Nothing is authored | **Compute it from simulation state.** Never author. |

> ### The key move
> **Difficulty is declared on the asset; execution is verified by the simulation.** This splits
> an unsolvable pose-classification problem into a data problem plus a tolerance check. A
> pancake sit is difficult because [`spin-positions.json`](../data/spin-positions.json) says so.
> Whether *this* skater actually achieved a pancake, held it for two revolutions, and stayed
> centred while doing it — that is physics, and the simulation answers it precisely.

---

## 2 · The segment model

A spin is not a state. **It is a sequence of segments.** A new segment opens on any change of:

- position variation
- foot
- edge sign
- rotation direction

Each segment accumulates revolutions, minimum and maximum angular velocity, mean pose error
against its reference pose, and worst centering error.

Almost every observed feature then reduces to a query over that list — which is why this system
is far smaller than the rulebook makes it sound:

| Feature | Becomes |
| --- | --- |
| Eight revolutions without any change | `any segment where revolutions ≥ 8` — free, because a segment *by definition* contains no changes |
| Clear change of edge | `adjacent segments, same variation, opposite edge sign, ≥2 revs each side` |
| Clear increase of speed | `any segment where omegaMax / omegaMin ≥ 1.30` |
| Both directions back to back | `adjacent segments with opposite rotation sign` |
| All three positions on the second foot | `distinct basic positions among segments starting after the foot change ≥ 3` |

The two-revolution windows on either side of an edge change are what separate a *feature* from
a *wobble*. Without them, every unsteady spin would score level 4.

---

## 3 · Attained, attempted, and the three-state HUD

A declared feature has three outcomes, not two, and the middle one carries most of the design
value:

| State | Meaning | Level | GOE | HUD |
| --- | --- | --- | --- | --- |
| **Earned** | Declared and held within tolerance for the required revolutions | +1 | — | Filled |
| **Missed** | Declared, attempted, not held | 0 | **−0.35 each** | Struck through |
| **Available** | Not attempted | 0 | — | Hairline |

Reaching for a feature and missing it is **not neutral**. It is a visible error — a skater who
grabs for a Biellmann and cannot get the foot up has done something worse than not trying. The
panel treats it as such, and so does this system.

The live checklist in the HUD ([bible §2.5](design-bible.md#25-the-spin-system)) shows all
three states *during* the spin, so the player learns the difference between reaching and
achieving while there is still time to fix it.

### Pose fidelity

A declared position counts only while `MeanJointAngleError(pose, referencePose)` is within the
variation's `pose_tolerance_deg`. Two separate counters run per segment:

- `Revolutions` — elapsed, regardless of quality
- `RevolutionsAttained` — accumulated **only inside tolerance**

Features test the second. This is what stops a player claiming a cannonball by dipping into it
for a quarter turn.

Tolerances tighten with difficulty: 15° for a basic upright, 10° for a Biellmann or a donut.

---

## 4 · Level formulas

### Spins — feature count

```
level = min(count(earned features), 4)
```

Level B is zero features. Features that count *per basic position* (difficult variation,
change of edge, increase of speed) can therefore contribute up to three from a combination
spin, which is exactly why combination spins are where levels are won.

### Step sequences — graded prerequisite plus features

Turn variety is not a binary feature; the ISU grades it on a four-step ladder
(minimum variety → simple variety → variety → complexity). Our rule:

```
level = min(variety_grade, 1 + other_features_attained)
```

| Case | Result | Why it is right |
| --- | --- | --- |
| Complexity + 3 features | 4 | Everything present |
| Complexity + 0 features | 1 | Beautiful turns, no ice coverage, one direction, no upper body — that is not a level-4 sequence |
| Minimum variety + 3 features | 1 | Three turns and a chassé cannot be rescued by covering the ice |

Both clamps are correct in spirit, and the formula produces them without special cases.

### What is tunable versus structural

| Structural — changing it changes the system | Tunable — a balance lever |
| --- | --- |
| The declared/observed split | Every threshold number |
| The segment model | The variety ladder counts (5 / 7 / 9 / 11 types) |
| Attained vs attempted vs available | Pose tolerances |
| The level formulas | The 1.30 speed ratio, the 0.45 m centering limit |
| Features counting per basic position | The −0.35 GOE per missed feature |

**Every number in the data files is a balance lever.** The ISU says *"clear increase of
speed"*; a human technical specialist applies judgement; a game must pick a number. We picked
1.30. That is a design decision, not a rule, and it should be labelled as one wherever it
appears.

---

## 5 · The hard cases

| Case | Why it is hard | Resolution |
| --- | --- | --- |
| **Difficult variation** | Pose classification, not physics | Declared on the asset. Verified by joint-angle error plus held revolutions. |
| **Difficult entrance** | "Difficult" is a judgement about the approach | Declared on the entry asset. Verified by entry speed, no stop beforehand, ≤2 setup steps, and position attained within 2 revolutions. |
| **Difficult change of foot** | "Difficult" means the change of foot and change of position happen *together*, not in sequence | Purely observed: test whether the two transition time-ranges **overlap**. |
| **Use of upper body movements** | Sounds like it needs pose analysis | It does not. The right stick already drives the upper body every frame; integrate carriage displacement *and its rate of change* over pattern length. Rewards motion, not a held pose. |
| **Variety / complexity of turns** | A human judgement about breadth | Operationalised as counts of distinct turn and step types, distinct difficult-turn types, both feet, both rotational directions. Numbers are tunable. |
| **Ice coverage** | Needs a pattern measurement | Read straight off the tracing buffer. One measurement serves both the level feature and the Composition component of PCS. |
| **Both directions** | Sounds exotic | Nearly free: reversing a spin requires killing angular momentum and regenerating it in the opposite sense, so the sign of `L` flips and the segment model catches it. |

---

## 6 · The physics tie-in

`spin-positions.json` carries an `inertia_scale` per variation, multiplying the baseline
open-position moment of inertia:

| Position | `inertia_scale` | Consequence |
| --- | --- | --- |
| Biellmann | 0.80 | Fastest — mass drawn close to the vertical axis |
| Upright | 1.00 | Baseline |
| Sit | 1.25 | Free leg extended forward |
| Pancake | 1.50 | Both legs extended |
| Camel | 2.20 | Slowest — body horizontal, mass far from the axis |

Since `ω = L / I`, **a camel is visibly slow and a Biellmann visibly fast as a consequence of
the catalogue, not of any scripting.** The player feels the spin accelerate as they pull into
an upright, and that acceleration is exactly what earns the increase-of-speed feature. The
scoring system and the physics agree because they are the same number.

This also makes position choice a real trade-off: a camel is a slow spin that bleeds angular
momentum for longer and makes eight revolutions harder to reach, but it is a distinct basic
position and so opens more per-position features.

---

## 7 · Validating against reality

The detector's thresholds are guesses until they are tested against actual judged skating.
There is a free, public corpus for this: **ISU protocol sheets are published for every
competition**, listing every element with its called level.

The validation loop:

1. Pick 50 elements across published protocols spanning levels B–4 and all spin types.
2. Reconstruct each in the Composer from the video, matching positions, revolutions and
   transitions as closely as the tooling allows.
3. Run the detector.
4. Compare called level against the published level.

**Target: ≥ 85% exact level agreement, with no disagreement greater than one level.**
Disagreements are triaged into (a) reconstruction error, (b) threshold miscalibration —
adjust the data, or (c) a missing or misread feature — a specification bug.

Run this as a CI suite once the corpus exists. It is the only way to know whether the numbers
in §4 are right, and it turns "does our judging feel authentic?" from a matter of opinion into
a percentage.

This work belongs in the **vertical slice**, not pre-production — it needs the Composer's v0
element list ([pre-production plan §5](pre-production-plan.md#5--parallel-tracks)) to exist first.

---

## 8 · Data files

| File | Contents |
| --- | --- |
| [`spin-positions.json`](../data/spin-positions.json) | 19 positions across upright/sit/camel with difficulty flags, pose tolerances, inertia scales, flexibility gates. Plus 8 entries and 4 exits. **This is what "declared" features reference.** |
| [`spin-features.json`](../data/spin-features.json) | 11 spin features with their kind, scope, caps, and detection requirements. Plus minimum revolution requirements per spin type. |
| [`step-features.json`](../data/step-features.json) | The turn taxonomy, the four-grade variety ladder, 4 step-sequence features, and choreographic sequence validity. |

Level base values are in [`spin-step-values.csv`](../data/spin-step-values.csv), which now
includes level B.

### Flexibility gating

Several positions carry `requires_flexibility`. Below that threshold the position cannot be
selected in the Composer at all — a skater built without the flexibility attribute genuinely
cannot do a Biellmann, which is true of real skaters and gives the character creator's body
sliders ([bible §4.3](design-bible.md#43-character-customisation)) a consequence in the
technical score rather than only in presentation.

---

*Feature lists must be verified against the current ISU Communication before content lock.
Every threshold is a balance lever. Tracked in [open-decisions.md](open-decisions.md).*
