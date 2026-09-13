# Validation cases

**The reference corpus the fidelity gate is checked against.** One JSON file per case in
[`cases/`](cases/), named `<id>.json`. The rules these files implement are in
[`docs/fidelity-gate.md`](../../docs/fidelity-gate.md): what counts as evidence (§2), what a case may
set (§3), the observables (§4), tolerances (§5) and verdicts (§6). This file specifies the format.

> **A stub with a null expectation is correct. An invented number is a defect.** Every case whose value
> has to come from footage, a protocol or a paper not yet read ships with `"expected": null`. It is
> reported as *unsourced* until someone measures it.

---

## A case

```json
{
  "id": "carve-residual-mid",
  "kind": "carve",
  "role": "validation",
  "source": {
    "type": "derived",
    "citation": "tan φ = v² / (g r) for an inverted pendulum in a steady turn",
    "primary_checked": null,
    "notes": ""
  },
  "requires": [],
  "skater": null,
  "venue": null,
  "inputs": {
    "initial": { "speed_ms": 5.0, "lean_rad": 0.0 },
    "modes": { "jumpMode": 0, "movesMode": 0 },
    "script": [ { "seconds": 10.0, "input": { "lean": 0.3, "weight": 1.0 } } ],
    "clip": null
  },
  "observable": { "name": "carve_lean_residual_deg", "window": "steady", "radius": "com" },
  "expected": {
    "comparison": "within",
    "value": 0.0,
    "unit": "deg",
    "measurement_uncertainty": 0.0,
    "band": 0.5,
    "tolerance": 0.5,
    "confidence": "L0"
  }
}
```

## Fields

**`id`** — lowercase kebab-case, equal to the file name without `.json`.

**`kind`** — the observable class: `carve` (O1), `tracing` (O2), `transition` (O3), `glide` (O4), `jump`
(O5), `inertia` (O6) or `propulsion` (O7).

**`role`** — `validation`, or `calibration` if the case was used to set a constant. Calibration cases
must still pass, but never count toward coverage ([gate §7.2](../../docs/fidelity-gate.md#72--permitted-moves)).

**`source`**
- `type` — `derived`, `literature`, `protocol` or `footage` ([gate §2.2](../../docs/fidelity-gate.md#22--source-types)).
- `citation` — enough for someone else to find the exact table, figure, protocol page or video
  timestamp. For `derived`, the relation.
- `primary_checked` — for `literature`: `true` once the value has been read in the primary source,
  `false` while it is quoted second-hand. A secondary case never counts toward coverage.
  `null` for other types.
- `notes` — the measurement method, and anything a reviewer needs.

**`requires`** — model features the case needs. Current features: `jumps`, `moves`, `three-turn`,
`mohawk`, `twizzle`, `spin`, `ina-bauer`, `crossover`. A feature not in that list — for example
`bracket`, `rocker-turn`, `counter`, `choctaw` — makes the verdict *unmodelled*.

**`skater`** — `null` for the reference skater (55 kg, 1.65 m), or `{ "mass_kg", "height_m" }`. Stats
stay at the neutral 50 ([open-constants §12](../../docs/open-constants.md#12--outside-the-gate)).

**`venue`** — `null` for a simulated rink: flat, model air density. Otherwise the rink record below.

**`inputs`**
- `initial` — `speed_ms` (0–100) and `lean_rad` (±1.55).
- `modes` — `jumpMode` (0–2) and `movesMode` (0–1). These are the only `Params` a case sets
  ([gate §3](../../docs/fidelity-gate.md#3--the-configuration-under-test)).
- `script` — a list of segments. Each holds `input` for `seconds`, rounded to whole 120 Hz ticks.
  `input` is a partial `SkatingInput` (`sim/types.ts`): fields left out take `NEUTRAL_INPUT`'s value.
  The validator expands the script into a replay clip, so the existing first-divergence check applies.
- `clip` — alternatively, a path relative to this directory to an `edgework-replay/1` clip. Exactly
  one of `script` and `clip` is non-null.

`inputs` is `null` in a stub. Whoever fills in `expected` also writes the script that attempts the element.

**`observable`**
- `name` — one of the observables in [gate §4.3](../../docs/fidelity-gate.md#43--the-observable-classes).
- `window` — `steady` ([gate §4.4](../../docs/fidelity-gate.md#44--steady-windows)), `flight`
  (takeoff to landing), `element` (the named move from start to end), or `{ "from_s", "to_s" }`.
- `radius` — `com` or `blade` for observables that use a radius, otherwise `null`.

The observable sits outside `expected` so that a stub with `"expected": null` still says what it measures.

**`expected`** — `null`, or:
- `comparison` — `within` (two-sided), `at_least`, `at_most`, `holds` (one-sided: `carve_held`,
  `jump_reachable`, `propulsion_reachable`), or `call` (categorical: `rotation_call`).
- `value` — the number, or for `call` one of `clean`, `q`, `<`, `<<`. For `holds`, `true`.
- `unit`.
- `measurement_uncertainty` — u<sub>m</sub>, from the source. `0` for derived cases.
- `band` — b, copied from [gate §5.1](../../docs/fidelity-gate.md#51--model-bands) for this observable.
- `tolerance` — √(u<sub>m</sub>² + b²), written out so the arithmetic can be checked. The validator recomputes
  it and fails the case if they disagree.
- `confidence` — L0–L3, the level of the expected value.

---

## The venue record

Every field may be `null`. Record what is known. Nothing here is guessed to fill a gap.

| Field | Type | Meaning |
| --- | --- | --- |
| `venue_type` | `competition`, `training`, `public`, `barn`, `outdoor` | What kind of rink |
| `indoor` | boolean | |
| `elevation_m` | number | For air density |
| `slab` | `engineered`, `thin-concrete`, `sand`, `natural` | What the ice sits on |
| `ice_surface_temp_c` | number | Measured at the surface |
| `air_temp_c`, `air_rh_pct` | number | Air above the ice, at skating height |
| `air_density_kg_m3` | number | The one physical input a case may set. Computed from the three above if they are known. |
| `water_tds_ppm` | number | From the rink's water log |
| `ice_hardness_shore_d` | number | Shore D, the best-behaved instrument in Hutchins et al. 2026 ([ice-literature §5](../../docs/ice-literature.md#5--rink-ice-as-a-material-hardness-and-static-friction)) |
| `minutes_since_resurface` | number | |
| `surface` | object | Below |
| `rink_location` | `centre`, `boards`, `corner`, `end` | Where on the ice the measurement was taken |
| `travel_direction` | `clockwise`, `counterclockwise`, `long-axis-positive`, `long-axis-negative` | Which way the skater went |
| `paired_case` | id | The same stretch skated the opposite way. Required for footage `glide` cases. |

### `surface`: the shape of the ice

```json
"surface": { "profile": "convex", "relief_mm": 6, "measured": false, "method": "" }
```

- `profile` — `flat`, `convex` (centre higher than the boards), `concave` (centre lower) or `unknown`.
- `relief_mm` — centre height minus board height. Positive is convex, negative concave.
- `measured` — `true` only with a `method`: a laser level, a water level, or a string line with a
  feeler gauge, at stated points.

**Why it is recorded.** A slope of 0.002, 2 cm over 10 m, gives 0.02 m/s² along the ice. That is a third
of the model's blade-friction deceleration. So a glide case on a shaped rink without a paired
opposite-direction run measures the slope as much as the friction. Averaging a pair cancels the slope.
The difference measures it.

**What is expected, and how sure.** These are the owner's field observations, **L3** until measured:
- **Public rinks** tend slightly **convex**. Session skating runs laps near the boards, and wears the
  outer ice down relative to the middle.
- **Old barn rinks on a thin poured slab** tend slightly **concave**. The slab settles, and the ice
  follows it.
- **Competition rinks** are closest to flat.

**In the solver.** `rinkRelief` (`sim/params.ts`) is this shape. A case with a measured `relief_mm`
runs with that relief, divided by 1000, as a venue input. The lab's named shapes (`RINKS`: public
+4.5 mm, barn −9 mm) are L3 defaults for skating, never case inputs.

An unsourced competing observation, **L3**, is that resurfacing can build ice *up* along the boards. That
would push a rink toward concave. Both mechanisms can act at once, so a rink's relief is measured, not
assumed from its type.

---

## What is in `cases/` now

- **Derived cases**, which run today:
  - four checks of the steady-carve lean relation, at slow, middle and fast speeds and two-footed;
  - two checks that jump height and air time agree ballistically.
- **Literature stubs** from the digest ([ice-literature §9](../../docs/ice-literature.md#9--candidate-literature-cases-for-task-12)).
  They have null expectations, because their values are secondary quotes not yet checked against the
  primary.
- **Footage and protocol stubs**, at least one for every observable that needs an outside measurement,
  and one each for the unmodelled turns.

The validator (Task 1.3) reads everything here. Nothing in `cases/` is read by the instrument.
