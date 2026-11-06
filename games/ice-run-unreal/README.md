# EDGEWORK / Ice Run — Unreal Engine client

An Unreal Engine 5.8 presentation of the same Ice Lab engine the browser and Godot games run.
It is a client of `games/ice-run-godot/bridge/host.mjs`: one local Node process runs the solver
at 120 ticks per second, and Unreal sends it the pad and keyboard and draws what comes back.
The renderer never writes physics, so a run here is the same run, tick for tick, as in the
other two games. A native C++ port of the solver is a separate, later track, verified against
recorded replays.

This follows the owner's choice of 3 November 2026 ("bridge-first is fine") under D2 in
[`docs/open-decisions.md`](../../docs/open-decisions.md) (Unreal Engine 5.4+). The Godot game
stays the playable build until this one has its menus.

## Run

Needs the installed Unreal Engine 5.8 Linux build (tested with 5.8.4, CL 58902052) and Node 24
or newer. The engine is looked for at `~/UnrealEngine/Linux_Unreal_Engine_5.8.4`; set
`UE_ROOT` for another place, and `ICE_RUN_NODE` for a particular Node.

```sh
./games/ice-run-unreal/run.sh                      # Blade Explorer, free skate
./games/ice-run-unreal/run.sh -IceSetup=simulation # any setup: simulation, explorer,
                                                   # experimental, diggate, repertoire, none
```

`run.sh` runs `tools/prepare.mjs`, which prepares the bridge's runtime (the Godot game's
`prepare.mjs --engine-only`), compiles the C++ module when its source changed, and imports the
skaters when they are missing or older than their `.glb`. The first launch compiles shaders,
which takes several minutes once.

| Key | Does |
| --- | --- |
| Pad / keyboard | Skating, exactly as the Godot game: a setup sends the raw pad (`game/full-controls.ts` maps it), the original schemes send named inputs |
| Esc / Menu | The menu: continue, skip a lesson step, the tutorial and each setup's lesson, free skate, career, rookie gates, light course, setup, camera, quit. D-pad or stick to move, A / Enter to choose, ◀ ▶ to change, B / Esc to go back |
| Tab | Next setup (Explorer → Simulation → Experimental → Dig Gate → Repertoire → original schemes) |
| M | Next mode: free skate, the tutorial, career (First ice), rookie gates, the light course |
| R | Skate again |
| V / View | Next camera: Tracking, Broadcast, Rink, Blade (not in the air) |
| F9 / F11 | Save the replay (`Saved/IceRun/ice-run-replay.json`) / fullscreen |

Lessons are the engine's own: `game/tutorial.ts` ("Trust the ice": balance, edges, travel, stops,
the air) and `game/padcourse.ts` (one course per setup), with their words for the pad in your
hands. The card on the ice shows the step, its stage, what to do, and how long its condition has
held; a fall wipes the step's progress until you have stood still a moment. The Travel stage puts
its targets on the ice: a marker to reach, a cone to go round, a far marker across the sheet, two
checkpoints for half a lap, and a mark to stop on after the snowplow. The next one glows, and an
arrow on the ice points to it. The rookie gates (with their cones and foam bars) and the light
course's lights are drawn the same way.

The **steadying hand** (`game/steady.ts`, Esc / Menu → Steadying hand) is a hand on the stick,
never the physics: it keeps the lean you ask for to what your speed can carry. Off by default in
Simulation, Experimental and Dig Gate, Light elsewhere; Firm holds you to the safe lean. The
balance meter under the skater shows it: green is the lean this speed's edge can hold, the
champagne ticks are the hand's limit, and the marker is your lean now. `-IceSteady=off|light|firm`
sets it from the command line.

More options: `-IceMode=free|lesson|career|rookie|timed`, `-IceCourse=trust|<course id>`, `-IceEvent=N`,
`-IceSkater=Athlete|Competition|Berserker|Violet`, `-IceCamera=N`.

The career saves to `games/ice-run-unreal/Saved/IceRun/career-v1.json`, apart from the Godot
game's save: the two builds do not share a career yet.

## Verify

```sh
node --test games/ice-run-unreal/tests/*.test.mjs
```

Without an engine this checks the project file, that every op the client sends is one
`host.mjs` answers, and that the C++ skater and sim-space mapping still carry the Godot
scripts' constants. With the engine and a built module it also runs the live smoke test:

```sh
UnrealEditor-Cmd games/ice-run-unreal/IceRun.uproject -game -nullrhi -unattended -IceSmoke -UseFixedTimeStep -FPS=60
```

which skates the first career event's three elements through the real bridge (carve, then
crouch, as the Godot smoke test does) and prints `UNREAL_SMOKE_PASS`. On a fixed time step it
skates the 75-second program in a few seconds.

For stills without anyone at the machine: `-RenderOffscreen -IceShots=2,4,6 -IceShotDir=<dir>`
writes PNGs at those seconds of the run and quits.

## How it is built

| File | Part |
| --- | --- |
| `Source/IceRun/IceBridge.*` | The Node process and its JSON lines (posix_spawn; stderr kept apart for failures) |
| `Source/IceRun/IceFrame.*` | A bridge snapshot as typed state, words and trace samples |
| `Source/IceRun/IceRunGameMode.*` | The session: catalog, configure, start, 120 Hz ticks owed, smoke and stills |
| `Source/IceRun/IceRunPlayerController.*` | Pad and keyboard into `controls`, as `main.gd` builds them |
| `Source/IceRun/IceSkater.*` | `skater.gd`'s pose from physics, ported line for line |
| `Source/IceRun/IceRink.*` | The sheet from the catalog's rink, boards, hall, roof fixtures, blade grooves |
| `Source/IceRun/IceShotCamera.*` | `main.gd`'s four cameras with `shot.gd`'s framing |
| `Source/IceRun/IceRunHUD.*` | Move, edges, TES, coach line and results, in the engine's words |
| `Source/IceRun/IceSimSpace.h` | Sim metres (y left) to Unreal centimetres (Y right), the twin of `sim_space.gd` |
| `tools/build_content.py` | Imports the Godot `.glb` skaters through Interchange; makes `M_Surface` and `M_Ice` |

Every sim position reaches the world through `IceSimSpace`, and the skater's pose is worked in
Godot's body frame so it reads against `skater.gd`; the one conversion to Unreal's left-handed
frame is `IceSimSpace::FromBody`. A turn about an axis changes sense across that conversion,
which is why the spine and head twists are negated there.

Not yet here: the full menus (career pages, Composer, atelier, settings), music and sound, the
skirt's springs, face and eyes, snow spray, the crowd, costume recolouring, Elite paddles, and a
packaged build. The venue is plain next to the Godot Northlight arena.
