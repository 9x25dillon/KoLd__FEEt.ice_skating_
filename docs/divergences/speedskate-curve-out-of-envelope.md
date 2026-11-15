# Divergence — a long-track curve is outside the model's envelope

| | |
| --- | --- |
| **Id** | `speedskate-curve-out-of-envelope` |
| **Status** | **open** — recorded as *unmodelled*, with one question for the owner (below) |
| **Raised** | 2026-11-14, solver `ice-lab-f64/39` |
| **Cases** | `carve-lean-speedskate-curve-right-kimura2024`, `carve-lean-speedskate-curve-left-kimura2024` |
| **Observable** | `carve_lean_deg` (O1) |
| **Reproduce** | `cd tools/ice-lab && node --test test/speedskate-curve.test.ts` |
| **Structures** | S5 bite law with S2 rigid rocker ([fidelity-gate §4.2](../fidelity-gate.md#42--how-the-solver-relates-these-read-from-the-code)) |

## The measurement

Kimura Y, Yokozawa T (2024). *Skating techniques of ladies' world-class long-distance speed skaters to
shorten curved-section time during the official 3,000 m race.* Frontiers in Sports and Active Living
6, 1396219. [doi:10.3389/fspor.2024.1396219](https://doi.org/10.3389/fspor.2024.1396219). Open access,
CC BY 4.0. Read in the full text on 2026-11-14 (Europe PMC, PMC11153739): Tables 2 and 4.

Fourteen world-class women through the first inner curve of a World Cup 3,000 m, three 300 Hz cameras,
three-dimensional coordinates with control-point errors of 11 to 14 mm. Per stroke, mean ± SD over the
skaters:

| Stroke, stage | Speed, m/s | Centre-of-mass radius, m | Centripetal acceleration, m/s² | Body tilt, ° | atan(a / g), ° |
| --- | ---: | ---: | ---: | ---: | ---: |
| Left, initial | 12.41 ± 0.22 | 28.22 ± 2.04 | 5.81 ± 0.50 | 28.00 ± 1.95 | 30.64 |
| Left, middle | 12.02 ± 0.39 | 28.97 ± 1.78 | 5.40 ± 0.37 | 26.79 ± 1.25 | 28.83 |
| Left, final | 11.85 ± 0.40 | 28.30 ± 2.24 | 5.31 ± 0.48 | 26.37 ± 1.86 | 28.43 |
| Right, initial | 12.37 ± 0.33 | 26.14 ± 1.59 | 6.25 ± 0.32 | 32.18 ± 1.79 | 32.50 |
| Right, middle | 12.10 ± 0.26 | 26.28 ± 1.76 | 5.94 ± 0.50 | 30.97 ± 2.53 | 31.20 |
| Right, final | 11.85 ± 0.30 | 25.55 ± 1.26 | 5.85 ± 0.34 | 31.19 ± 1.45 | 30.81 |

The last column is this project's arithmetic on the paper's accelerations, not the paper's. Body tilt
is the angle from vertical of the line from the ankle to the centre of mass, across the travel,
averaged over the stroke. The two initial-stage rows are the cases. They were chosen before any run,
as the first row of each table.

## What the model does

| | Expected | Actual | Deviation | Tolerance |
| --- | ---: | ---: | ---: | ---: |
| Right, initial: `carve_lean_deg` at 12.37 m/s on 26.14 m | 32.18° | **no steady window** | — | 3.49° |
| Left, initial: `carve_lean_deg` at 12.41 m/s on 28.22 m | 28.00° | **no steady window** | — | 3.58° |

Asked for the right-stroke curve on `responsive` (the paper's mean skater, the paper's speed, the
paper's tilt commanded, no push):

- the edge lets go 0.05 s in and skids for 0.88 s;
- it holds again at **8.93 m/s**, having lost 3.4 m/s to the skid;
- at 6 s, where a steady window could first close, the skater is doing **6.87 m/s** at a lean of
  32.3°, on a radius of about 7.6 m. Upright and not fallen.

So the model never skates the paper's curve. It skates a much smaller one at the commanded lean.

## Why — localised

**Governing equations.** A rigid rocker traces R = ρ / sin θ (S2), so a wide curve needs a nearly
upright blade. The bite law's capacity grows with tilt (S5): a<sub>max</sub> = g (c<sub>0</sub> +
c<sub>1</sub> sin θ). Put together, the lateral acceleration the model can carry on a radius R is

    a_max(R) = g (c0 + c1 ρ / R)

With ρ = 2.05 m, c<sub>0</sub> = 0.08, c<sub>1</sub> = 3.5 and R = 26.14 m: **3.48 m/s²**. That is
9.5 m/s and a lean of 19.5° at most. The skaters carried 6.25 m/s². The test asserts this arithmetic
and the run.

**Three causes, in the order fidelity-gate §7 says to look.**

1. **The measurement is of a different blade and a different act.** A long-track blade has a rocker of
   roughly 20 m or more, against the model's 2.05 m figure blade, and the skaters are stroking through
   the curve, not holding a glide. A case may set the skater, the start and the inputs, and may not
   set the blade ([gate §3](../fidelity-gate.md#3--the-configuration-under-test)). This alone makes
   the cases unmodelled, and it is why they are not counted as failures.
2. **Nothing holds 12.4 m/s without pushing.** The model's straight-line loss at that speed is
   about 0.9 m/s² for this skater, nearly all of it air drag (C<sub>d</sub>A 0.495 m²). A §4.4 steady window opens 5 s after
   the last input change and forbids a push, so it cannot contain a speed that needs power to hold.
   The carve observables as defined cannot be taken on a stroked curve at racing speed.
3. **The shape of a<sub>max</sub>(R) is a claim that could be wrong for a figure blade too.**
   *Hypothesis, untested.* The model says the edge a skater can hold gets weaker as the curve gets
   wider, because holding needs tilt and tilt forces a tight radius. On a figure blade at figure
   speeds this has not been checked: a back crossover curve at 8 m/s on a 10 m radius needs 6.4 m/s²
   and the model allows 7.8 m/s² there, so ordinary skating is inside it. Fast, wide, deeply leaned
   edges are where it would show: a<sub>max</sub> falls below 5 m/s² (a lean of 27°) for any radius
   over 16.7 m.

## What the paper does support

The paper's own two columns agree with the relation the model holds by construction (S1, S3):
tan φ = a / g. Across all six rows the point-mass lean is within **+2.64° to −0.38°** of the measured
tilt, inside each row's tolerance of 3.3° to 3.9°. Right strokes agree to 0.4°; left strokes sit
2.0° to 2.6° more upright than a point mass would, on every stage. The test prints the six rows.

That is external support for S1 on real bodies. **It is not counted toward O1 coverage**, because no
run of the model produced it: it is the paper against a formula.

## Proposed test

For hypothesis 3: footage of a figure skater on a long, fast, held edge (a spiral or a spread eagle
across the rink), with speed from rink markings and the radius from the tracing. A held edge at
7 m/s on a 20 m radius needs 2.45 m/s² and the model allows 4.3 m/s²; one at 8 m/s on 20 m needs
3.2 m/s². A clean edge beyond a<sub>max</sub>(R) would be a structural failure of S5 with S2, under
[gate §7.3](../fidelity-gate.md#73--structural-failures-falsify). This is what
`carve-held-deep-edge-footage` is waiting for.

## Question for the owner

Should a case that runs the model at the paper's **centripetal acceleration** instead of its speed
and radius (for example 7.0 m/s on 7.9 m, which the model holds at 32.5°) count toward O1? It would
pass, with a margin of 3.2°. It was not added. The model's lean equals atan(a / g) by construction,
so such a case tests whether real skaters lean like point masses, which the paragraph above already
shows, and says nothing about whether the model's edge holds where theirs did. Counting it would
move O1 off zero on evidence that does not exercise the blade.
