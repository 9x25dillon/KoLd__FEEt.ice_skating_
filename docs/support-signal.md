# The support signal and the weight transfer

**What carries the skater, read once, for every presentation.** 2026-11-14.

A skater only looks like a skater if the blades visibly hand the body from one to the other. Before
this, the physics did not do that: it switched the load between blades in a single tick, and each game
client worked out support separately and then eased over the jump. This change does two things.
It makes the hand-over physical in the solver, behind a setting. It also publishes one reading of
support that Godot and Unreal both pose from.

## What was wrong (measured, `main` d4ac1cc)

The skater glided at 3 m/s while the weight input stepped the way a pad steps it: left, then both
feet, then right.

- The load moved 100/0 → 50/50 → 0/100, each step **within one tick** (1/120 s).
- In the same tick, the left blade's contact moved **12 cm sideways**.
- At an exact 50/50 the support foot became the right, because a tie went to the right.

The cause is in two places:
- `solver.ts` set each blade's load straight from `input.weight`.
- The pad mapping (`full-controls.ts`) only ever sends 0, 0.5 or 1.

Both clients (`skater.gd`, `IceSkater.cpp`) hid the step: `contact_slide` eased the 12 cm away, and
`foot_on_ice` eased the lift. That smoothing is what made the support change read as sliding rather
than as an exchange of weight.

## 1 · The weight transfer (`weightTransferMode`, sim)

With the setting at 1, the right blade's share of the load is solver state, `loadR`. It follows the
asked share as a critically damped second-order response: no overshoot from rest, its rate
continuous, done to within 0.5 % in `weightTransferTime` (0.25 s, **authored**; see
[open-constants §16](open-constants.md#16--the-weight-transfer)).

- **The stance moves with the load.** The pendulum's base is the centre of pressure at every share.
  The blade taking the load comes under it, and the blade giving it up goes out a stance's width.
  The share-weighted offsets sum to zero (`stanceOffset`).
- **A blade leaves the ice when its share reaches zero**, not when the input changes.
- **Moves that own their foot set the share at once**: a pivot, a spin, an Ina Bauer. So does the
  first tick after a jump's flight, because a landing comes down on the foot it lands on.
- **Off (0) is unchanged.** Every replay digest is the same, and the fixture is rebased with the
  same digests.

**Measured with the setting on** (same 3 m/s glide, each step half the load):
- the share moves at most 0.048 per tick;
- its rate changes by at most 3.7 /s in a tick;
- no contact moves more than 1.2 cm across in a tick;
- the left blade leaves the ice 0.242 s after the right is asked for.

`test/support.test.ts` holds looser bounds that also cover a whole-load step: 0.1 per tick,
8 /s, 2.5 cm, and 0.15–0.25 s.

**Off in every setup, for now.** On in Simulation, Experimental and Dig Gate, 51 pinned tests move.
Among them, the searched double loop's takeoff L falls from 28.65 to 19.90. Its script flips the
weight input just before the jump loads (ticks 174–186), which was free when the switch took a
tick and now carries load into the takeoff. That is the transfer doing its job, but it invalidates
the jump calibrations, the JPSE conformance files and the tutorial scripts. Turning it on is the
owner's decision.

**A stroke changes with it.** A push acts only while the pushing blade is on the ice
(`if (push.inContact)`). With the transfer, the push keeps acting through the overlap while the
blade gives up its load. Six two-foot pushes, each followed by a glide on the other foot
(`pose_clip.mjs --strokes`), end at 7.06 m/s with the setting on and 6.42 m/s with it off.
Measured, not tuned.

## 2 · The support signal (`sim/support.ts`)

`supportSignal(state)` is a pure function of the solver's state: derived, never stored. Computing it
changes no digest (tested). Every frame that carries a skater sends it beside the state:
- the bridge snapshot;
- the warm-up skaters;
- the pairs partner;
- the podium;
- `pose_clip.mjs`.

| Field | Meaning |
|---|---|
| `phase` | `one`, `both`, `shift` (two blades on the ice, the load moving), `air`, `down` |
| `foot` | the blade carrying the most (`supportFoot`) |
| `toward` | the blade gaining load during a shift, or -1 |
| `share` | each blade's share, 0..1; both 0 in the air or down |
| `rate` | each share's rate, 1/s; 0 with the setting off |
| `role` | per blade: `carrying`, `sharing`, `taking`, `giving`, `free` |
| `cop` | the centre of pressure, world m; the COM's ground point when nothing carries |
| `comOver` | `{across, along}` m from the centre of pressure to the COM's ground point, in the heading's frame |
| `comHeight` | m, `comZ` |

A shift counts once the share moves at 0.1 /s or more (`SHIFT_RATE`).

## 3 · The clients

`skater.gd` and `IceSkater.cpp` take three things from the signal:
- the body's base: the pressure point times the total share;
- whether a blade is on the ice: its share is above zero;
- the loaded hip's rise: from the share.

They no longer each derive these from the blades. A frame without the signal (a clip recorded
before it) falls back to the old reading. `contact_slide` stays, because with the setting off the
contacts still jump.

## Evidence

- **Tests:**
  - `tools/ice-lab/test/support.test.ts`: 8 tests;
  - the whole Ice Lab suite, 1053 of 1053;
  - the Godot bridge tests, 61 of 61;
  - typecheck clean.
- **Pose lab** (`pose_clip.mjs --strokes [--transfer]`, then `pose_lab.gd --check`). Both pass:

  | Measure | Off | On |
  |---|---|---|
  | Feet off the sim's line | 2.2 cm | 1.4 cm |
  | Frames on two feet | 132 | 225 |
  | Largest foot step per frame | 9.8 cm | 9.0 cm |
  | Jerk | 27.9 | 29.6 (slightly higher) |

  The pose lab proves the pose agrees with the sim, not with real skaters.
- **Stills** in `presentation/support/`. The same push from the game's chase camera, the side, the
  rear and the boots, from -0.02 s to +0.32 s after the weight is asked across.
  - Before: the left foot is off the ice by +0.05 s.
  - After: both blades stay down through +0.20 s, and the free leg is up by +0.32 s.
- **Unreal** builds clean, and its tests pass, 8 of 8.

## Known limits

- **The stance moves under the COM; the COM doesn't sway over the stance.** The COM's path stays
  the solver's. In the world, a loaded blade slides up to the stance's width sideways over a
  transfer, where a real skater's body would move over a planted blade instead. The body-frame pose
  is right, but a blade's tracing on the ice is not.
- **A blade comes down already carrying.** It takes load from the first tick of a transfer, and the
  critically damped start makes that first load tiny. There is no separate set-down (a free foot
  reaching the ice before it bears anything).
- **The stance's centre-of-pressure authority** (`copMax`) is still the symmetric half-width, whatever
  the share.
- **The 0.25 s and the response's shape are authored.**
