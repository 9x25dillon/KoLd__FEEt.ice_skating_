# The stroke model against a measured standing start (2026-11-27)

Measurement only: no solver or default changed. Bench: `tools/ice-lab/bench/stroke-start.ts`
(`node bench/stroke-start.ts --json ../../docs/stroke-start-2026-11-27.json`, 1.8 s). The owner
asked for a sprint start; the push angle alone could not reach the one readable measurement, so
this measures what the stroke model would need.

## The reference
Rice MS et al. (2024), Front. Sports Act. Living 6:1418713, Table 3: on-ice 54 m test, 6.1 m split
from a standstill **1.53 ± 0.19 s** (range 1.32–1.89); maximum speed 6.75 ± 0.26 m/s; n = 11 male
youth hockey players, about 10 years old, maximal effort. Not figure skaters, not adults, hockey
skates: a reference for the order of magnitude, not a gate case. Papers with measured start
angles (Budarick et al. 2020 Sports Biomech; de Koning et al. 1995 MSSE; McGill start theses)
could not be read (HTTP 403); none of their numbers is used here.

No gate case constrains propulsion today: `stroke-gain-footage`, `propulsion-reachable-footage`
and `crossover-gain-back-footage` are unsourced stubs. `strokePower` 3.2 is the design bible's
J = m·k·knee·dt; `strokeBeta` 37°, `strokeDuration` 0.30 s and `strokeEdge` 20° are authored.

## Today (Simulation; Explorer and Experimental within 0.01 s / 0.01 m/s)
| | 6.1 m from rest | speed at 2 s | cruise after 10 s | after 20 s | one push at 6 m/s |
|---|---|---|---|---|---|
| tap | 4.61 s | | | | |
| full effort (power 1, bend 1) | 3.74 s | 1.77 m/s | 9.07 m/s | 11.29 m/s, still rising | +0.28 m/s |

Both ends are off: the start is 2.4× slower than the reference, and steady pushing passes the
reference's 6.75 m/s maximum and keeps accelerating. (The Composer's own table assumes a push adds
0.75 m/s at 6 m/s, `data/motion-primitives.json`, a design value; the sim gives 0.28.)

## Candidates (full-effort start, Simulation)
| Change | 6.1 m | cruise 20 s | push at 6 m/s |
|---|---|---|---|
| strokePower ×1.5 everywhere | 3.01 s | 14.43 m/s | 0.43 |
| ×2 | 2.62 s | 17.02 m/s | 0.52 |
| ×4 | 2.15 s | 21.26 m/s | 0.73 |
| shorter strokes, 0.20 s / 0.15 s | 3.82 / 3.89 s | 11.08 / 10.93 | 0.18 / 0.13 |
| splay 90° at rest (angle only) | 2.86 s | unchanged | unchanged |
| low-speed push gain G0 at rest → 1 by 3 m/s, G0 = 2 / 5 / 20 | 3.02 / 2.54 / 2.31 s | unchanged | unchanged |
| splay 85° and G0 5 together | **2.30 s** | unchanged | unchanged |

No combination of these reaches 1.53 s, and no row falls. Why (`g0-probe`): the pushing blade's grip
(`biteCapacity`) caps the push near **400 N**, 0.74 of body weight at 55 kg, at the authored 20° push
edge; past G0 ≈ 2 the extra force is cut off (79 of 910 stroke ticks capped at G0 20). And each
push's force fades linearly to nothing over its 0.30 s, so a stroke averages half its peak. The
reference implies a mean forward acceleration of about 5.2 m/s² over the first 6.1 m; the model
gives about 2.3 at its best.

## What this says
- Raising push force everywhere cannot fit the start: by ×4 the start is still 0.6 s slow and
  cruising runs to 21 m/s.
- The model's push is constant in speed: weak from rest, and unlimited at speed (only friction
  stops it). Real pushes are the reverse — strong from rest, limited at speed by how fast the leg
  can extend (the force–velocity relation). Both mismatches above are that one shape.
- A start that matches needs, together: a wide splay at rest, a deeper push edge (more grip) at
  rest, more push force at low speed, and a push that holds its force through the stroke rather
  than fading from the first tick. That is a different stroke model, not a parameter.

## Options for the owner
1. **A power-limited stroke, behind a mode** (recommended direction): push force capped by leg
   power, F ≤ P / v_leg, with the splay and push edge following speed. One shape fixes both ends;
   it needs a sourced leg power and a full re-measure (every pinned push test, career baselines,
   JPSE entrances), then the owner turns it on per setup.
2. **The 90° wide start only, behind a mode**: 3.74 → 2.86 s, honest about the remaining gap;
   no new force.
3. **Leave the stroke as it is** and record the start and top-speed gaps as known limits.
Supplying the 403'd papers (above) would give measured start angles and forces for either 1 or 2.

## Built (the owner: "just build the damn sprint into the game", 2026-11-27)
`startPushMode` (sim/solver.ts, Params), on in GAME_PARAMS and every setup: from rest the push turns
out to 90° and pushes 2× (startPushGain), blending into the cruising stroke by 3 m/s, with its
sideways reaction held to the cruising stroke's so the extra force goes forward. In all five setups:
a tap reaches 2 m/s in **1.31 s** (was 3.47) and 3 m/s in 2.59 s (5.23); full RT 3 m/s in **1.72 s**
(3.51). Above 3 m/s nothing changes. Still about 1 s slower than the youth reference over 6.1 m;
the stroke-model gap above stands.

With it, `boardsUnstickMode` on everywhere (game/rink.ts): slow against the boards she pushes off
along her blade; hard boards still bounce and crash outside Beginner and the lessons. Six scripted
novice minutes: pinned at the boards 25 / 122 / 14 s → 0, distance skated ×1.4–2.4, falls per km
117 / 183 / 87 → 143 / 141 / 122 (Simulation / Experimental / Repertoire). The warm-up group, pairs
and the steadying-hand harness now pass their params to the boards as the game does.

Re-pinned with reasons (all "from rest" rows; rows from 3 m/s up unchanged): ghost strokes / dig /
snowplow / spin, setups standstill speeds, explorer-knee margin (relative), styles top speeds,
steady novice falls, tutorial Repertoire "Across the ice" (17.97 → 15.97 s), JPSE report fixture
(only the reverse pair's entrance tail moved; canonical and mirror byte-identical).
Not re-measured: the career's rival BASELINE (`rival_baseline.mjs`, >10 min); its pilot starts at
4.5 m/s, so only its get-ups after falls feel the start.
