# Divergence — the numerical floor is larger than the review's figures

| | |
| --- | --- |
| **Id** | `numerical-floor-vs-review` |
| **Status** | **open** — owner's decision needed (below) |
| **Raised** | 2026-11-14, commit after `281bf8d`, solver `ice-lab-f64/39` |
| **Test** | `tools/ice-lab/test/discretisation.test.ts`, "the review's floor figures hold on every steady case" (failing, marked `todo`) |
| **Reproduce** | `cd tools/ice-lab && node --test test/discretisation.test.ts` |
| **Gate impact** | none: the step-size error is 170 times inside the tightest gate band it touches |

## What was expected

The 2026-11-15 engineering review measured one held edge (4 m/s, 20°, `responsive`, 120 Hz against
960 Hz) and reported:

- fitted radius error **4.3 × 10⁻⁵** relative;
- lean-residual drift **4.7 × 10⁻⁴ °**.

The build brief turned those into thresholds for four cases (4 and 6 m/s, 20° and 30°): radius
error under **1 × 10⁻⁴** relative and residual drift under **1 × 10⁻³ °**. The thresholds were written
before this test ran.

## What was measured

Same preset, same settle (2.0 s), three windows of a third of a second, radius from the circle
through the three window-end positions, 120 Hz against 960 Hz.

| Case | Observable | Threshold | Actual | Deviation | Verdict |
| --- | --- | ---: | ---: | ---: | --- |
| 4 m/s, 20° | radius error, relative | 1 × 10⁻⁴ | 5.10 × 10⁻⁵ | −4.9 × 10⁻⁵ | holds |
| 4 m/s, 20° | residual drift | 1 × 10⁻³ ° | 2.88 × 10⁻³ ° | +1.9 × 10⁻³ ° | **over, 2.9×** |
| 6 m/s, 20° | radius error, relative | 1 × 10⁻⁴ | 1.68 × 10⁻⁴ | +6.8 × 10⁻⁵ | **over, 1.7×** |
| 6 m/s, 20° | residual drift | 1 × 10⁻³ ° | 1.53 × 10⁻³ ° | +5.3 × 10⁻⁴ ° | **over, 1.5×** |
| 6 m/s, 30° | radius error, relative | 1 × 10⁻⁴ | 2.43 × 10⁻⁴ | +1.4 × 10⁻⁴ | **over, 2.4×** |
| 6 m/s, 30° | residual drift | 1 × 10⁻³ ° | 1.92 × 10⁻³ ° | +9.2 × 10⁻⁴ ° | **over, 1.9×** |
| 4 m/s, 30° | — | — | — | — | not a held edge (below) |

One of six holds. The radius figure reproduces on the review's own case (5.1 × 10⁻⁵ here against its
4.3 × 10⁻⁵). The residual figure does not reproduce on any case, including the review's.

**4 m/s at 30° is not a steady case.** The lean wants r = v² / (g tan φ) = 2.82 m and the edge traces
about 2.27 m. The skater is still up through the measurement and is down before 6 s. It stays in the
sweep's printed table because the brief named it, and out of the floor.

## Why they differ — hypotheses, in the order to check them

1. **The review's residual figure is a different pair of step sizes.** *Untested guess.* The
   480 Hz against 960 Hz drift on the review's case is 4.1 × 10⁻⁴ ° here, close to the reported
   4.7 × 10⁻⁴ °; the 120 Hz against 960 Hz drift is 2.9 × 10⁻³ °. The review's probe scripts are not
   in the repository, so this cannot be confirmed from here.
2. **The review's case was configured differently.** It reports a fitted radius of 4.486 m for
   "a held 20° edge at 4 m/s"; this test fits 3.627 m for the same words. A different lean command
   (the test commands `lean / maxLean`, as `carve.test.ts` does) or different loss terms would give
   a different edge and a different floor. The settling ripple agrees between the two (1.6 × 10⁻² °),
   so the difference is in the edge, not the method of taking the residual.
3. **The floor grows with speed, and one case could not show it.** Measured, not a guess: radius
   error rises from 5.1 × 10⁻⁵ at 4 m/s to 1.7–2.4 × 10⁻⁴ at 6 m/s. The position error behind it is
   along-track phase, which scales with distance travelled. A threshold taken from the slowest case
   is the most optimistic one available.

None of these is a defect in the solver. The observed order (1.21 to 1.58) is what a semi-implicit
Euler step with smooth blending should give, and the error falls at every halving.

## What it means for the gate

Nothing moves. Against the bands that existed before the measurement
([fidelity-gate §5.1](../fidelity-gate.md#51--model-bands)):

| Observable | Gate band | Worst step-size error | Margin |
| --- | ---: | ---: | ---: |
| `trace_radius_m` | ±10% | 2.43 × 10⁻⁴ relative | 410× |
| `carve_lean_residual_deg` | ±0.5° | 2.88 × 10⁻³ ° | 170× |

The review's conclusion stands on these numbers: discretisation is not a fidelity-gate risk. What does
not stand is the size of the floor it quoted.

## Proposed resolution — the owner's call

The thresholds were not widened and the test was not rewritten. Two ways to close this, either of
which is a recorded decision under fidelity-gate §5:

- **A (recommended). Replace the two figures with the measured floor** over the standing cases:
  radius 2.5 × 10⁻⁴ relative, residual 3 × 10⁻³ °. These are what
  [fidelity-gate §5.3](../fidelity-gate.md#53--the-numerical-floor) already records as measured. The
  `todo` test then asserts those and passes; the pinned-floor test beside it already guards against
  the floor moving.
- **B. Keep the review's figures as a target** and leave the test failing until the integrator
  reaches them. Halving the step to 240 Hz would meet each figure on two of the three standing
  cases (radius 1.05 × 10⁻⁴ at 6 m/s and 30°, residual 1.23 × 10⁻³ ° at 4 m/s and 20° stay over).
  That is a solver change with a replay-contract bump, and nothing in the gate asks for it.

## Proposed test of hypothesis 1 and 2

Add the review's probe scripts (`review/probe-observables.mjs`) to the repository, or state its lean
command, loss terms and the pair of rates behind the 4.7 × 10⁻⁴ ° figure. With that, one run decides
between hypotheses 1 and 2.
