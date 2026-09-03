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
| `spin-step-values.csv` | Spin and step sequence base values by level, with the fixed per-level GOE step. |
| `calls-and-deductions.csv` | Technical panel calls (`q`, `<`, `<<`, `!`, `e`, `*`) with the simulation thresholds that trigger them, plus the deduction schedule. |
| `segment-rules.csv` | Per-discipline segment duration, tolerance, PCS component factor, and well-balanced program element counts. |

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

## Deliberately not here

Spin and step sequence **level features** — the criteria that raise an element from
level 1 to level 4 — are a longer structured list than CSV handles well. They belong in
a structured format (JSON or a UE DataTable) once the spin resolver's feature detection
is specified. Tracked in `docs/open-decisions.md`.
