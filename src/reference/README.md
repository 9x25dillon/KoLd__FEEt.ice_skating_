# Reference implementations

Four excerpts from §10 of the design bible, extracted verbatim so the document and the
code cannot drift. If you edit these, mirror the change into `docs/design-bible.md`.

| File | Bible § | What it specifies |
| --- | --- | --- |
| `SkateSolver.cpp` | 10.1 | The carve solver. One skater, one tick, a pure function of state, input and ice. The heart of the game. |
| `JumpResolver.cpp` | 10.2 | Load → air → land, with ballistics fixed at takeoff and rotation accounting that mirrors how a technical panel calls a jump. |
| `ScoreCalculator.cs` | 10.3 | ISU data model, base values, GOE aggregation across nine judges, PCS factors, deductions. |
| `SkaterAnimDriver.cpp` | 10.4 | Layered animation state resolution plus the post-selection warping chain. |
| `SpinResolver.cpp` | [level-features.md](../../docs/level-features.md) | The segment model and level-feature detection for spins. Reduces most of the ISU feature list to queries over a list of segments. |
| `TransitionSolver.cpp` | [composer-solver.md](../../docs/composer-solver.md) | The Composer's transition planner: bidirectional lattice A*, time fitting with slack-filling, whole-program DP chaining, and constraint-relaxation diagnostics. |

## These do not compile, and that is intentional

They are **specifications as code**. Helper functions (`MoveTowards`, `WrapPi`,
`EdgeMismatch`, `SignedCarveRadius`, `OrientationWarp`, …) are described in the bible and
deliberately left to the implementation — their signatures are obvious and their bodies are
uninteresting. What matters here is the *shape*: which quantities exist, what depends on
what, and where each decision is made.

Three structural properties are load-bearing and should survive any rewrite:

1. **`FSkateSolver::Tick` is a pure function.** State in, state out, plus writes to the ice
   grid. No engine types, no allocation, no side effects. Everything downstream — replays,
   ghost opponents, server-side verification, the Composer's transition solver — depends on
   this holding.

2. **Jump ballistics are fixed at takeoff.** `VertVel`, `AirTime` and `AngMomentum` are
   assigned once, in the load case, and never touched again. The air phase has exactly one
   lever, `InertiaZ`, because that is the only lever a real skater has. Resist every request
   to add mid-air correction.

3. **The animation layer never decides anything.** `Resolve` reads simulation state and
   returns a pose selection. If animation ever writes back into `FSkaterState`, determinism
   is gone and so is multiplayer.

## Language choice

The C++ files are Unreal-flavoured (`F` prefixes, `FVector`) — and since
[D2 closed to Unreal 5.4+](../../docs/open-decisions.md#d2--engine), that idiom is now literal
rather than illustrative. Write `USkateMovementComponent`; never bend `CharacterMovementComponent`.

`ScoreCalculator.cs` is the one deliberate exception and stays C#. Scoring runs headlessly in the
server-side verification path, where a managed implementation is the more convenient host. Port it
to C++ only if that service ends up in-engine.

Licensed Apache-2.0 (see `/LICENSE-CODE`), unlike the design documents.
