# EDGEWORK / Ice Run — Unreal Engine client

An Unreal Engine 5.8 presentation of the same Ice Lab engine the browser and Godot games run.
It is a client of `games/ice-run-godot/bridge/host.mjs`: one local Node process runs the solver
at 120 ticks per second, and Unreal sends it the pad and keyboard and draws what comes back.
The renderer never writes physics, so a run here is the same run, tick for tick, as in the
other two games. A native C++ port of the solver is a separate, later track, verified against
recorded replays.

This follows the owner's choice of 3 November 2026 ("bridge-first is fine") under D2 in
[`docs/open-decisions.md`](../../docs/open-decisions.md) (Unreal Engine 5.4+). It carries the
Godot game's menus: the Season and its story, training, the Composer, the wardrobe and atelier,
lessons and settings, all through the same bridge ops.

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
| Esc / Menu | The menus: Continue, The Season, Lessons, The Composer, Free skate, Rookie gates, Light course, Wardrobe, Settings, Quit. D-pad or stick to move, A / Enter to choose, ◀ ▶ to change, B / Esc to go back |
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

## The Season, training and the wardrobe

The menus are the Godot game's pages, drawn from the bridge's snapshot and acting only through
its ops, so the career, the plans and the wardrobe live where they always have (`game/career.ts`,
`game/atelier.ts`, saved by `host.mjs`).

- **The Season** (`game/story.ts`): five events told by a coach, Mara Ellison, with the rivals
  from `game/rivals.ts` and the season's table. Each event has a briefing before it and a chapter
  ending after it, by medal; the words change no score. The coach's advice reads your career
  (an injury, rust before a jump, wear, your weakest stat) and changes nothing.
- **The briefing**: your program for the event (◀ ▶ moves an element, `+ Add` up to two of your
  own, A takes one of yours out), the field, and **♪ Lay it on the music**: each element on a bar
  of a track (`game/composer.ts`). ◀ ▶ moves an element a bar, A plays the music from its bar,
  and the strip shows the program on its bars (gold for your own, the line at half time). A
  program on its music runs the full time, and the run shows when each bar comes round and how
  the last one went: shown, not scored.
- **Training**: raise a stat with XP and a week, drill a jump family against rust, rest a worn
  region; **Style** picks the arm focus and its drill.
- **The result**: the chapter's ending, the protocol, the XP, the standings, and the replay.
- **The Composer**: your own free program, phrase by phrase.
- **Pairs** (`game/pairs.ts`): a partner the sim skates too, the Black Berserker as in the Godot
  game, through five phrases: matching edges, hand in hand (G / D-pad left), a side-by-side spin,
  a supported lift (T / D-pad right; the partner rises with it), a final line. The HUD keeps the
  pairs score and how much of it you skated in unison. **Pairs challenge** runs it against 90 s.
- **Wardrobe**: four skaters, the costumes, and the atelier: a design in a slot (bodice, skirt,
  sleeves, trim and crystals, tights, hair colour, skin tone, then the fabric and how many
  crystals), previewed on the skater and worn when kept.
- **Settings**: setup, steadying hand, Explorer assistance, skater level, music track and on or
  off, controller vibration, Elite paddles, camera, display. Kept in `Saved/IceRun/preferences.json`.

**Elite paddles** (a wired Xbox Elite Series 2): Unreal's Linux input drops the paddles, so the
client reads them from the kernel itself (`IcePaddles`: the pad found through sysfs, its event node
opened read only, its held keys polled). Settings → Elite paddles chooses `main.gd`'s layouts: the
controller's own profile, Footwork (LB, RB, A, R3), Moves (X, B, A, Y), or the game's own layer
(buttons 18-21: feet, free leg or weight). Lessons → Elite paddles starts their course and sets the
game layer. The presets and the layer need the Elite on its default profile, profile LEDs off.

The sound is `main.gd`'s, made live on the audio thread (`IceSound`): the blade on the ice, louder
with speed and when an edge slips sideways, quiet in the air and on a fall; the hall's crowd,
which swells after a landing (more for a clean one); and a landing's thud. The pad rumbles on a
landing, briefly for a clean one and harder for a fall. The broadcast plate says TAKE THE ICE
where you are skating, then CLEAN LANDING or FIND YOUR EDGE with the rotations and the jump TES.
Under the readouts are `main.gd`'s broadcast meters: wind and legs (what the program has left in
her), each blade's share of the load, the knee, and the coil where the setup winds the shoulders
against the hips. At the bottom right, YOUR LINE: the rink from above, the line skated since the
run began, where she is and which way she faces, and in a lesson the next target to reach.

The athlete's face is `skater.gd`'s: her eyes lead her head to where she is going, settling on
small fixations of their own; she blinks every few seconds, with a large glance, and as she lands,
and her lids follow her gaze down (`M_Eye` slides the model's own iris; the Blink morph moves the
lids, so the content build gives the skaters' materials a morph-ready parent, `M_GltfMorph`).

The stands hold arena.gd's audience: about three thousand seated spectators (the Godot arena's
own model, instanced), each with a coat, a skin tone and their own timing. Their heads follow the
skater; after a landing the hall rises (most of them for a clean one, a few for one that is not),
arms up and clapping, and settles over a few seconds. `M_Crowd` is `crowd.gdshader` as two HLSL
nodes, built by `tools/build_content.py`.

Snow comes off a blade whose edge slips sideways at speed (a skid, a hard carve), thrown back and
up, harder the more that blade is loaded, as `skater.gd`'s sprays do (`IceSpray`); it settles on
the ice. A plain glide or the Explorer brake hardly slips, so it throws little.

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

The menus have their own walk, a player's way through them against the live bridge: the
Season, a plan changed and put back, the first event laid on its music and skated to its result
and story, a stat trained, a costume changed, the skater changed and back (each wearing only its
own materials), a design kept and worn, a Composer phrase added, and pairs started with a hand
offered to the partner.

```sh
UnrealEditor-Cmd games/ice-run-unreal/IceRun.uproject -game -nullrhi -unattended -IceMenuTest -UseFixedTimeStep -FPS=60
```

prints `UNREAL_MENUS_PASS`. Both tests, and stills, skate on a throwaway save under
`Saved/IceRun/test-runs/`, never the player's career.

For stills without anyone at the machine: `-RenderOffscreen -IceShots=2,4,6 -IceShotDir=<dir>`
writes PNGs at those seconds of the run and quits. `-IceOpenMenu=<page>` stills a menu page
(`season`, `training`, `wardrobe`, `music`, …), `-IceSkipSteps=N` a later lesson step, and
`-IceOnMusic` (with `-IceMode=career`) a career program laid on its music.

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
| `Source/IceRun/IceRunMenus.cpp` | The menu pages as data: the Season, briefing, music, training, style, result, Composer, wardrobe, atelier, lessons, settings |
| `Source/IceRun/IceRunHUD.*` | Move, edges, TES, coach and cue lines, the lesson card, the balance meter, the broadcast plate, meters and rink map, and the menu pages, in the engine's words |
| `Source/IceRun/IceSound.*` | The blade, the crowd and a landing's thud, synthesized as `main.gd` does |
| `Source/IceRun/IceSpray.*` | The snow off each blade, as `skater.gd`'s two particle sprays |
| `Source/IceRun/IceSimSpace.h` | Sim metres (y left) to Unreal centimetres (Y right), the twin of `sim_space.gd` |
| `tools/build_content.py` | Imports the Godot `.glb` skaters and spectator through Interchange; makes `M_Surface`, `M_Ice` and `M_Crowd`; imports the music |

Every sim position reaches the world through `IceSimSpace`, and the skater's pose is worked in
Godot's body frame so it reads against `skater.gd`; the one conversion to Unreal's left-handed
frame is `IceSimSpace::FromBody`. A turn about an axis changes sense across that conversion,
which is why the spine and head twists are negated there.

Not yet here: a packaged build. The venue is plain next to the Godot Northlight
arena.
