# Fidelity report

> **GENERATED — do not edit.** Written by `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md`
> from the cases in [`data/validation/cases/`](../data/validation/cases/), against the specification in
> [`fidelity-gate.md`](fidelity-gate.md). CI regenerates it on every push and fails if it differs.

Preset under test **`responsive`** (the public build's boot preset); reference **`spec`**, reported, not gated. Solver `ice-lab-f64/19`.

## Gate

**Gate not met.** 6 pass, 0 fail, 26 unsourced, 0 unmodelled, of 32 cases.

| §6.3 | Condition | State |
| --- | --- | --- |
| 1 | No failing sourced case | met |
| 2 | Three passing external cases per class, from two independent sources | **not met** — see coverage below |
| 3 | No calibration case counted | met by construction: the count excludes them |
| 4 | Reproduced by CI, byte-identical | checked by `.github/workflows/ice-lab-checks.yml`, not by this file |

## Coverage by observable class

External passing counts literature cases only once `primary_checked` is true (§2.2). Three per class are needed.

| Class | Cases | Pass | Fail | Unsourced | Unmodelled | External passing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| O1 carve relation | 6 | 4 | 0 | 2 | 0 | 0 / 3 |
| O2 tracing curvature | 2 | 0 | 0 | 2 | 0 | 0 / 3 |
| O3 edge transitions | 7 | 0 | 0 | 7 | 0 | 0 / 3 |
| O4 speed decay | 5 | 0 | 0 | 5 | 0 | 0 / 3 |
| O5 jump rotation | 6 | 2 | 0 | 4 | 0 | 0 / 3 |
| O6 moment of inertia | 3 | 0 | 0 | 3 | 0 | 0 / 3 |
| O7 propulsion | 3 | 0 | 0 | 3 | 0 | 0 / 3 |

## Pass state by observable

| Observable | Cases | Pass | Fail | Unsourced | Unmodelled |
| --- | ---: | ---: | ---: | ---: | ---: |
| `air_time_height_residual_m` | 2 | 2 | 0 | 0 | 0 |
| `air_time_s` | 1 | 0 | 0 | 1 | 0 |
| `carve_held` | 1 | 0 | 0 | 1 | 0 |
| `carve_lean_deg` | 1 | 0 | 0 | 1 | 0 |
| `carve_lean_residual_deg` | 4 | 4 | 0 | 0 | 0 |
| `crossover_gain_ms` | 1 | 0 | 0 | 1 | 0 |
| `glide_decel_ms2` | 4 | 0 | 0 | 4 | 0 |
| `ina_bauer_speed_loss_ms` | 1 | 0 | 0 | 1 | 0 |
| `jump_reachable` | 1 | 0 | 0 | 1 | 0 |
| `propulsion_reachable` | 1 | 0 | 0 | 1 | 0 |
| `pull_in_ratio` | 1 | 0 | 0 | 1 | 0 |
| `revolutions_turned` | 1 | 0 | 0 | 1 | 0 |
| `rotation_call` | 1 | 0 | 0 | 1 | 0 |
| `spin_decay_per_s` | 1 | 0 | 0 | 1 | 0 |
| `spin_rate_rps` | 1 | 0 | 0 | 1 | 0 |
| `stroke_gain_ms` | 1 | 0 | 0 | 1 | 0 |
| `trace_lobe_radius_m` | 1 | 0 | 0 | 1 | 0 |
| `trace_radius_m` | 1 | 0 | 0 | 1 | 0 |
| `turn_entry_angle_deg` | 4 | 0 | 0 | 4 | 0 |
| `turn_speed_loss_ms` | 2 | 0 | 0 | 2 | 0 |
| `twizzle_rate_rps` | 1 | 0 | 0 | 1 | 0 |

## Sourced cases

| Case | Source | Observable | Expected | Tolerance | Actual | Deviation | Verdict | `spec` |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `carve-residual-fast-deep` | derived | `carve_lean_residual_deg` | 0.0000 deg | 0.5000 | -0.0054 | -0.0054 | pass | fail 0.6109 |
| `carve-residual-mid` | derived | `carve_lean_residual_deg` | 0.0000 deg | 0.5000 | 0.0032 | 0.0032 | pass | fail 0.5313 |
| `carve-residual-slow-shallow` | derived | `carve_lean_residual_deg` | 0.0000 deg | 0.5000 | 0.0031 | 0.0031 | pass | fail (no steady window (fidelity-gate §4.4)) |
| `carve-residual-two-foot` | derived | `carve_lean_residual_deg` | 0.0000 deg | 0.5000 | 0.0517 | 0.0517 | pass | fail (no steady window (fidelity-gate §4.4)) |
| `flight-residual-full-jump-moves` | derived | `air_time_height_residual_m` | 0.0000 m | 0.0500 | -0.0010 | -0.0010 | pass | pass -0.0010 |
| `flight-residual-hop` | derived | `air_time_height_residual_m` | 0.0000 m | 0.0500 | -0.0010 | -0.0010 | pass | pass -0.0010 |

## Unsourced (26)

Stubs waiting for a measurement. A null expectation is correct; an invented number would be a defect.

- `air-time-footage` — footage, `air_time_s`
- `bracket-unmodelled` — footage, `turn_entry_angle_deg`
- `carve-held-deep-edge-footage` — footage, `carve_held`
- `carve-lean-footage` — footage, `carve_lean_deg`
- `counter-unmodelled` — footage, `turn_entry_angle_deg`
- `crossover-gain-back-footage` — footage, `crossover_gain_ms`
- `glide-hockey-sled-federolf2008` — literature, `glide_decel_ms2`
- `glide-low-speed-rink-pair-a` — footage, `glide_decel_ms2`
- `glide-low-speed-rink-pair-b` — footage, `glide_decel_ms2`
- `glide-straight-speedskate-dekoning1992` — literature, `glide_decel_ms2`
- `ina-bauer-speed-loss-footage` — footage, `ina_bauer_speed_loss_ms`
- `jump-reachable-triple-footage` — footage, `jump_reachable`
- `mohawk-speed-loss-footage` — footage, `turn_speed_loss_ms`
- `propulsion-reachable-footage` — footage, `propulsion_reachable`
- `pull-in-ratio-spin-footage` — footage, `pull_in_ratio`
- `revolutions-turned-footage` — footage, `revolutions_turned`
- `rocker-turn-unmodelled` — footage, `turn_entry_angle_deg`
- `rotation-call-protocol` — protocol, `rotation_call`
- `spin-decay-centred-footage` — footage, `spin_decay_per_s`
- `spin-rate-upright-footage` — footage, `spin_rate_rps`
- `stroke-gain-footage` — footage, `stroke_gain_ms`
- `three-turn-angles-footage` — footage, `turn_entry_angle_deg`
- `three-turn-speed-loss-footage` — footage, `turn_speed_loss_ms`
- `trace-figure-eight-lobe-footage` — footage, `trace_lobe_radius_m`
- `trace-radius-overhead-footage` — footage, `trace_radius_m`
- `twizzle-rate-footage` — footage, `twizzle_rate_rps`

## Unmodelled (0)

