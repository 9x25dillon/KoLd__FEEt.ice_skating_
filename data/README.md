# Scoring data

> **These values are indicative and must be verified against the current published ISU
> Scale of Values and Special Regulations before content lock.** The ISU revises base
> values, level features and component factors most seasons. Nothing in here belongs in
> code — §6.2 and §10.3 of the design bible treat these tables as hot-reloadable data
> precisely so that a rules change is a data patch shipped within days of publication,
> not a code release.

## Files

| File | Contents |
| --- | --- |
| `scale-of-values.csv` | Jump base values and GOE step per element. `goe_step` is 10% of base value, per the jump rule. |
| `jump-definitions.csv` | The physical definition of each jump: takeoff foot, edge, direction, toe assist, whether it is edge-callable. Drives `FJumpDef` and the entry-edge check. |
| `spin-step-values.csv` | Spin and step sequence base values by level (B, 1–4), with the fixed per-level GOE step. |
| `calls-and-deductions.csv` | Technical panel calls (`q`, `<`, `<<`, `!`, `e`, `*`) with the simulation thresholds that trigger them, plus the deduction schedule. |
| `segment-rules.csv` | Per-discipline segment duration, tolerance, PCS component factor, and well-balanced program element counts. |
| `spin-positions.json` | The authored position catalogue — 19 variations with difficulty flags, pose tolerances, moment-of-inertia scales and flexibility gates, plus 8 entries and 4 exits. What "declared" level features reference. |
| `spin-features.json` | The 11 spin level features, their detection requirements, and minimum revolution requirements per spin type. |
| `step-features.json` | Turn taxonomy, the four-grade variety ladder, step sequence features, and choreographic sequence validity. |
| `motion-primitives.json` | The move vocabulary the Composer's transition solver searches over: 21 primitives with preconditions, arc geometry, speed deltas and stamina costs. |
| `entry-templates.json` | Per-element required approaches — the run-in each element needs, which the solver plans *to* rather than planning an exact terminal pose. |

## Column notes

**`scale-of-values.csv`** — `revolutions` is the element's name-number (a "triple" is 3);
`rotations_actual` is the physically required rotation, which differs only for the axel
because it takes off forwards and therefore carries an extra half turn. The jump resolver
integrates against `rotations_actual`; the UI and protocol sheet display `revolutions`.

**`jump-definitions.csv`** — `rel_difficulty` is the triple base value normalised against
3T. It is derived, not independent: keep it consistent if you edit base values. `edge_callable`
is true only for flip and lutz, the two jumps that can draw an edge call.

**`calls-and-deductions.csv`** — `sim_trigger` gives the thresholds implemented in
`src/reference/JumpResolver.cpp`. Rotation shortfall is measured in revolutions against
`rotations_actual`. These thresholds are the game's interpretation of a human judgement
call and are the single most important balance lever in the technical score; expect to
tune them during the vertical slice.

**`segment-rules.csv`** — `component_factor` scales the three-component PCS total
(Composition, Presentation, Skating Skills) so that short and free programs reach
comparable magnitudes. Under the pre-2022 five-component system these factors were
different; do not mix the two systems.

## Level features

The three JSON files carry the criteria that raise an element from level B to level 4.
Their design — and in particular the split between **declared** difficulty (a flag on an
authored asset, verified by the simulation) and **observed** difficulty (computed purely
from simulation state) — is specified in
[`docs/level-features.md`](../docs/level-features.md).

Two cautions specific to these files:

1. **Every number is a balance lever, not a rule.** The ISU says "clear increase of speed";
   a human technical specialist applies judgement; a game must pick a number. We picked a
   1.30 ratio of peak to trough angular velocity. Label these as design decisions wherever
   they surface, and expect to tune them against real protocol sheets.

2. **`spin-positions.json` couples scoring to physics.** Each variation's `inertia_scale`
   feeds the solver directly, so a camel is slow and a Biellmann is fast as a consequence of
   this file rather than of any scripting. Editing these values changes how spins *feel*, not
   only how they score.
