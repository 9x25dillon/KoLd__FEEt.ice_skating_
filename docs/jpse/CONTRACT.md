# JPSE contract

The Jump Path Synthesis Engine (issue #74), written down as **stages that exchange
records**. Nothing here names an implementation language, a process boundary, or a
build system: a stage can be TypeScript in the Ice Lab rig, C++ in `tools/ice-lab/native`,
Rust, or Unreal code, as long as it reads and writes these records and reproduces the
conformance files. Code written later connects by passing the conformance files. It never
has to be rewritten to fit someone else's internals.

Status: `jpse-contract/1`, 2026-11-09. The TypeScript in `tools/ice-lab/jpse/` is the
**reference implementation**, which means its outputs are the conformance files. It does
not make TypeScript the required language.

## 1. The one fixed point: the solver

Every stage sits around one authority, **the Ice Lab solver**. Its interface is already a
contract (`edgework-replay/1`, `tools/ice-lab/native/reference/wire-manifest.json`):

```
Solver.create(params, speed, lean)          -> state
Solver.step(state, input, params, dt, grid) -> state', events
digest(state', events)                      -> u32   (CRC32 of canonical JSON)
```

- 120 Hz, `dt = 1/120`, IEEE-754 binary64 throughout.
- Today only the TypeScript solver runs. `native/` holds the wire types and
  canonical serialization but no solver (its README: `KernelAvailable` is false).
- A future solver port in any language is accepted when it reproduces the replay
  digests of `edgework-replay/1` clips, tick for tick. JPSE does not care which solver
  runs, only that it passes that test.
- **JPSE stages never write solver state.** They hand the solver inputs and read back
  what it did. This is the rule from the issue: the new engine may not secretly modify the
  physics layer.

## 2. Conventions every record uses

| thing | convention |
| --- | --- |
| units | SI: m, s, m/s, rad, rad/s, N, kg m²/s |
| ice plane | x along the rink's length, y across it, z up. Origin at the skater's start |
| angles | counter-clockwise positive, seen from above |
| curvature | signed, 1/m, counter-clockwise positive |
| lean | the solver's: + leans the COM toward perpLeft(heading) |
| heading | the support blade's toe-ward tangent. Skating backward, velocity opposes it |
| feet | 0 left, 1 right |
| edge code | three characters: foot `L/R`, direction `F/B/-`, side `O/I/-`; `---` off the ice (`data/jump-definitions.csv`'s spelling) |
| jump code | `T S Lo F Lz A`, or `none` |
| ticks | integers counted from 1 after the first step |
| report numbers | rounded to 1e-6 (`round(x * 1e6) / 1e6`). Per-tick streams are unrounded |
| JSON | UTF-8. Key order as written by the reference; conformance compares parsed values unless a file says byte-exact |

## 3. Stage map

Each stage is **takes → gives**. The status column says what exists, not who must build it.

| id | stage | takes | gives | status |
| --- | --- | --- | --- | --- |
| JPSE-001 | Canonical entrance | a measured source (a pad script, a replay, a capture) | `InputProgram` | reference: `jpse/baseline.ts` |
| JPSE-002 | Direction transforms | `InputProgram`, `Transform` | `InputProgram` | reference: `jpse/transform.ts` |
| JPSE-003 | Blade/travel geometry | `MotionFrame` stream | curvature, alpha_b, baseline kappa | reference: `jpse/geometry.ts` |
| JPSE-004 | Support load | `MotionFrame` stream | per-blade load share over the entrance | in the frames; no separate summary yet |
| JPSE-005 | Takeoff state | `MotionFrame` stream, solver events | `TakeoffState` | reference: `jpse/engine.ts` |
| JPSE-006 | Solver coupling | `Candidate` | `MotionFrame` stream, replay clip | reference: `jpse/engine.ts runCandidate` |
| JPSE-007 | Candidate search | `SearchSpec` | ranked `CandidateReport`s, seed and order recorded | open |
| JPSE-008 | Flight and landing validation | `MotionFrame` stream, solver landing result | `Flight`, `Landing`, gates | reference: `jpse/engine.ts` |
| JPSE-009 | Motion telemetry | `MotionFrame` stream | `MotionFrame` JSON lines, for renderers | reference: `jpse/cli.ts --frames` |
| JPSE-010 | Animation reconstruction | `MotionFrame` stream | a skeletal pose per tick | open (renderer side) |
| JPSE-011 | Routine synergy | a sequence of `CandidateReport`s | a game-progression bonus | open. Never feeds back into the physics or the official score |

Data flows one way, with the solver in the middle:

```
JPSE-001 ─► InputProgram ─► JPSE-002 ─► Candidate ─► JPSE-006 ──► Solver (authority)
                                                        │            │
                                                        ▼            ▼
                                                  MotionFrame ◄── state/events
                                                        │
        ┌───────────────┬───────────────┬───────────────┼───────────────┐
        ▼               ▼               ▼               ▼               ▼
    JPSE-003        JPSE-005        JPSE-008        JPSE-009        JPSE-010
    geometry        takeoff         flight/landing  telemetry       animation
        └───────────────┴───────┬───────┘
                                ▼
                         CandidateReport ─► JPSE-007 search ─► JPSE-011 synergy
```

## 4. Records

Each record has a JSON Schema in `docs/jpse/schema/`. The schema is the definition, and
the table below is the summary.

| record | schema | what it is |
| --- | --- | --- |
| `InputProgram` | `input-program.schema.json` | starting speed plus one `SkatingInput` per tick. The whole of a candidate's control |
| `Transform` | `candidate.schema.json` | `{mirror, reverse}` |
| `Candidate` | `candidate.schema.json` | id, transform, jump required, setup, program |
| `MotionFrame` | `motion-frame.schema.json` | one tick of what the solver did: COM, both blades, edge, load, jump phase |
| `CandidateReport` | `candidate-report.schema.json` | entrance, takeoff, flight, landing, gates, reasons, replay |
| `JpseReport` | `jpse-report.schema.json` | a slice: every candidate, the invariants, provenance |
| reason codes | `reasons.json` | the closed list of gate names and reason prefixes |

### Transforms, defined on the ice

- **mirror**: reflect across the entry line. Feet swap (`weight -> 1 - weight`,
  `pushFoot -> 1 - pushFoot`), and `lean, leanSplit, pitchSplit, kneeSplit,
  toeOutSplit, windup` change sign. A field at 0 stays +0. Everything else is unchanged.
- **reverse**: the same stance traveling the other way. `speed -> -speed`, inputs
  unchanged.
- A push left to the solver's alternation is first **pinned**, which means `pushFoot` is
  set to the leg the solver chose. This changes no digest, and it gives the mirror a leg
  to swap.

### Gates

Hard gates are pass/fail. A failed gate carries a reason from `reasons.json`, and no
soft number can buy back a hard failure. Completion is always the solver's own landing
call. The current gates, in order:

`finite-state, replay-deterministic, rotation-modelled, took-off, takeoff-edge,
takeoff-contact, completed`

A new gate is an additive change (§6).

### Provenance

Any threshold that a stage adds and the solver does not own carries
`{value, units, kind: measured|inferred|tuning, source}`.

## 5. Conformance

The conformance files are in `tools/ice-lab/test/fixtures/jpse/`. An implementation
**conforms to a stage** when, given the stage's input file, it produces the stage's
output file under the stated comparison.

| file | stage | comparison |
| --- | --- | --- |
| `canonical.program.json` | 001 output (pushes pinned), 002 input | byte-exact |
| `transforms.json` | 002 | `mirror`: each input's expected mirror; `speed`: each candidate's start. Value-exact (parsed numbers equal) |
| `geometry-cases.json` | 003 | each case `{fn, args, expected, tol}` within `tol` |
| `canonical.frames.jsonl` | 009 | value-exact. Every 12th tick of the canonical run, plus its takeoff and landing ticks |
| `../jpse-loop-v1.json` | 005, 006, 008 (the whole slice) | byte-exact; needs a solver that passes the replay digests |

The reference regenerates them with `node jpse/conformance.ts --write` (and the slice
report with `node jpse/cli.ts --out test/fixtures/jpse-loop-v1.json`).
`test/jpse-contract.test.ts` fails if any of them drifts, and it also validates every
record the reference writes against the schemas.

A port that stops at one stage is still useful. For example, a Rust or C++ JPSE-002/003
can pass `transforms.json` and `geometry-cases.json` without any solver, then hand
programs to whichever solver runs.

## 6. Versioning

- Record ids carry a version: `jpse-report/1`, `jpse-program/1`, `jpse-frame/1`.
- **Additive** changes keep the version: a new optional field, a new gate, a new
  reason. Readers ignore fields they don't know.
- **Breaking** changes bump it: renaming, removing, changing a unit or sign
  convention. The old conformance files stay until every consumer moves.
- When the solver changes on purpose (`ice-lab-f64/N`), the reference regenerates the
  conformance files in the same commit and says so.

## 7. Deliberately left open

These are open on purpose, so later code can choose:

- **Language and build** of any stage, including the solver port.
- **Process boundary**: an in-process library, a subprocess speaking JSON lines, a C
  ABI, or a network bridge (the Godot and Unreal clients already reach Ice Lab
  through `games/ice-run-godot/bridge/engine.mjs`).
- **Encoding beyond JSON**: a binary transport may be added if it round-trips these
  records exactly.
- **Search method** for JPSE-007. Any method qualifies if it is seeded and the order it
  tries candidates in can be replayed.
- **Skeleton and animation format** for JPSE-010.
