# Double loop: facing relative to travel

2026-09-27, `takeoff-yaw`, based on `df2d5ec` (landing-chain #50).

The held takeoff turns the body and its path together. Through its load and push,
each turns **87.151°**, leaving the body **0° off backward** along its velocity at
blade-off. Its **475.957°** of airborne rotation therefore reaches first contact
**115.957° off backward**. More turn along the same held curve does not create a
different facing angle relative to travel.

## Reproduce

From `tools/ice-lab`:

```sh
node test/takeoff-orientation.ts
node test/takeoff-orientation.ts --ticks
node test/landing-chain.ts
node test/takeoff-orientation.test.ts
```

The audit uses #49's cohort body and swing-through from 0.3 of the 0.25 s push;
the arms open at 0.375 s of flight. It changes no state or constants. Angles below
are degrees, counter-clockwise positive; ground turns run from the load reference
to blade-off. All arrival angles use the velocity **before** contact scrubs it.

| Scenario | Body turn on ice | Travel turn on ice | Body off backward at blade-off | Airborne body turn | Body off backward at first contact |
| --- | ---: | ---: | ---: | ---: | ---: |
| Held, swing-through | 87.151 | 87.151 | 0.000 | 475.957 | 115.957 |
| Held, free leg resting | 87.151 | 87.151 | 0.000 | 167.276 | 167.276 |
| Toe + hook, swing-through | 108.672 | 109.804 | -1.133 | 676.279 | -44.854 |

The toe + hook comparison uses the existing `toe: 1, toeAt: 0, hook: 0.2`
diagnostic. It is not a newly selected calibration. Its additional world turn
still produces little orientation change relative to travel.

## What the sources establish

[Yamaguchi & Sakurai (2025), §2.3 and Table 2](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1597598/full)
measure the shoulders' rotation between first blade-off and first contact. The
double-loop mean is 470.5 ± 23.9°. This is not a measurement of blade rotation,
takeoff pre-rotation, or either endpoint's facing relative to travel.

The model currently freezes trunk twist in the air, making its shoulder and body
rotation equal. That simplification does not make the two observables equivalent
in real skating. In particular, **720 − 470.5 = 249.5° does not establish a measured
249.5° turn of the takeoff blade**. Shoulder–blade offsets at both endpoints and
the landing orientation would be needed to draw that inference.

[Audrey Weisiger's loop teaching explanation](https://icoachskating.com/loop-jump-for-beginners-audrey-weisiger/)
describes turning toward forward near the toe before blade-off. This supports
investigating the blade's transition relative to travel, but supplies no numerical
double-loop target, torque, or contact law.

## Corrections made

The old landing-chain report used tick 262, the last airborne frame, for its
touchdown angle. Contact occurs on tick 263; another **8.677°** rotates during that
step. The report now reads `LandingBudget.heading` and `velPre`, reporting 115.957°
instead of 107.280°. Its check-to-touchdown inertia and spin columns also use the
actual contact record, and the rotation-at-check sum excludes blade-off's
not-yet-integrated angular velocity.

With `rotationCallMode: 1`, `land()` previously scored the check using airborne
rotation plus the takeoff's world turn. The arrival check now uses heading against
the incoming velocity: backward for a named jump; either along-blade direction
for a hop. With no meaningful travel direction (speed at or below `dirSpeedEps`),
there is no alignment penalty; the existing edge test still reads Stationary.
This is a geometric correction to an authored score, not a physical contact solve.

The element's counted rotation, takeoff credit, under-rotation call, and cheated
takeoff policy remain separate from this check. The baseline's check error is now
115.957°, rather than the ledger's 156.891°. It still falls at touchdown. A test
that rotates only the takeoff pose to align this same flight passes the alignment
check while retaining the same under-rotation call, flight and momentum. That
pose perturbation exists only in the test; it is not a gameplay correction.

The old contact/landingShock test opened at 0.25 s, landing 109.715° off backward;
that contact now fails its score. It uses the measured 0.275 s check instead to
exercise the shock after a score that passes. The impulse and shock arithmetic
are unchanged.

## Next physical owner

`solver.ts` §4 rotates velocity by the carve rate and body heading by carve plus
`yawDev`. With the feet held (`yawDev = 0`), those rotations are equal. Relative
facing must arise from contact/slip and segment motion, not another world-angle
credit. The current per-blade slip solve uses a heel/toe and stance lever;
the missing transition should be studied with contact-point velocity, including
the body's rotation and the blade's motion relative to the body, before replacing
the held-carve assumption.

Two connected limitations must be accounted for in that work:

- `jump.ts` identifies the element from the blade's direction at blade-off. A
  physically forward-facing exit from a backward loop setup needs the approach
  history to preserve its identity; an orientation fix alone could misidentify it.
- The air freezes shoulder–hip twist and makes the blades follow one heading.
  Real endpoint differences cannot be supplied by the source's shoulder-angle
  total alone. The audit records body, blade and shoulder angles separately.

The takeoff, blade grip, hip torque ceiling, tuck, landing impulse and
`landingShock` were not retuned. No angular offset is applied to make a double
land. The actual double-loop takeoff and landing remain unresolved.

## Validation and scope

42 focused jump, takeoff, flight and landing tests pass; three new regression
tests fail against the original `jump.ts` and pass with the alignment correction.
The entire mode-off trace, result and touchdown budget are byte-identical to the
original (277,945 bytes). TypeScript 7.0.2 with Node 26 types and the browser build
pass.

The full suite outside the subprocess-restricted sandbox reports **729 passed /
8 failed** (737 total). These are the eight failures already listed in the prior
handoff: backjump (2), ghost loop (2), tutorial air step (3), and the unfinished
replay fixture (1). Inside the sandbox, both before and after this change, the
runner reports six failing files instead, including subprocess-dependent `demo`
and `validate`; those extra failures disappear outside the sandbox.

All 20 Godot bridge tests pass after preparing the current engine. The pinned
native reference's 9 artifacts also match; this checks that reference, not a
native solver.

The change is inside the existing, default-off `rotationCallMode`. Replay stays
at the deliberately unfinished `/39`; its eventual canonicalisation must include
this experimental landing-score change. Existing mode-on intermediate recordings
can change at contact. The play checkout and served game were not updated.
