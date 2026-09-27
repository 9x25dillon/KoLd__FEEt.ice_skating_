# EDGEWORK / Grand Prix — Northlight delivery

September 27, 2026. The requested visual direction is a PS3-era skating sports
game: readable silhouettes, reflective ice, a large indoor competition venue,
satin costumes, a deliberate camera, and restrained broadcast graphics.

## Run

From the repository root, `npm start` prepares and launches the native game.
`npm run start:browser` retains the browser edition and its physics workshop.

The Linux executable is `games/ice-run-godot/exports/linux/ice-run.x86_64`.
Keep the adjacent PCK, `bridge/` and `runtime/` with it. Node 24.19+ or 26 is
required on PATH; Godot and Blender are not required to play the exported build.
Source launch also needs Godot 4 and FFmpeg. No npm install is required.

## Art direction and implementation

**Northlight Arena.** Cool, ivory-blue ice sits inside a midnight steel auditorium.
Champagne trim and event graphics give the rink a distinct identity. Four raked
spectator banks are separated by aisles. Repeated seats, spectators, heads and
sleeves use MultiMesh instancing. Columns, triangulated roof trusses, luminaires,
event banners, dasher boards and a four-sided centre scoreboard complete the venue.
The original rounded-square simulation boundary is preserved exactly.

**The competition athlete.** A new Blender source and glTF asset retain the
existing skeleton contract. Arms and legs have continuous meshes with blended
weights through the elbows and knees. The model includes sculpted facial profiles,
eyelids, irises, lips, ears, fingers, a braided bun, crystal embroidery, two skirt
layers, boot laces, leather heels, curved blade rails and toe picks. Original
Violet and Berserker assets remain selectable. The Northlight preset is shared
with the browser wardrobe, alongside Violet, Aurora and Solstice.

**Surface and motion.** The ice shader combines low-frequency ice variation,
resurfacing striations, fine scratches, subdued fixture highlights and a venue
reflection probe. The two blade traces persist through the run. Slip-driven
particles use the solver's contact/slip state. Satin has a procedural weave and
the skirt has small vertex flutter. The rig follows actual blade locations and
directions, knee pressure, trunk twist, stroke timing, jump state and spin position.
Foot orientation and import-facing corrections prevent the old backwards-facing
athlete / flipped boot presentation.

**Broadcast interface.** The lower thirds show actual move, speed, jump technical
total, spin level, stamina, blade loads and knee pressure. A rink navigator shows
the current line and heading. Career choreography and free-skate practice prompts
remain visible, with landing announcements and optional controller vibration.
The menu frames the athlete in a slow orbit with consistent navy/gold typography.

**Cameras and sound.** Tracking follows travel instead of spinning with the body.
Broadcast follows from the rink side; Rink gives an overview; Blade lowers the
camera. Changes are blocked during airborne jumps. Filtered blade noise, a quiet
synthetic crowd bed, touchdown thuds and landing crowd swells supplement the
existing music. These are procedural effects, not recorded audience samples.

## Systems retained and checked

The native bridge prepares all 58 TypeScript modules from this checkout's
`tools/ice-lab/{sim,app,game}` source. Preparing a module does not make its entire
browser UI a native feature. The native game retains:

- The deterministic 120 Hz skating solver and all four control setups.
- Manual blade/foot/knee controls, physical jumps, turns, spins and combinations.
- Career events, progression, training and local saves.
- Ordered program composition, including step sequences.
- Technical scoring and result protocols, including long-sheet scrolling.
- Practice objectives, Rookie gates and the timed light course.
- Music, replay export/import, replay verification and controller profile import.

Experimental preferences now survive restart; neither the native UI nor the bridge
can turn on Cruise for Experimental. Native Elite presets optionally map separately
reported paddle inputs. Controller-stored duplicate-button profiles remain supported.
Disconnects pause the game. Physical Elite 2 play-testing is still required; software
checks cannot establish the feel or driver mapping of a particular controller.

## Verification

- Integrated browser/simulation suite: **733 passed, eight inherited failures**
  out of 741. Current-main baseline was 729 passed / eight failed out of 737.
  The earlier 613-pass result belongs only to the old development checkout.
- Native bridge/host suite: **22 passed**, including raw-input solver parity for
  Simulation, Explorer, Experimental and Repertoire, replay and disk persistence.
- Godot import and renderer capture: completed without script/shader errors.
- Editor/runtime smoke: completed the actual three-element career routine.
- Exported Linux executable: independently completed the same career smoke test.
- Result UI smoke: empty sheet, 32 numbered elements, scoring calls and focus scrolling.

Reproduce:

```sh
npm test
node games/ice-run-godot/tools/prepare.mjs --engine-only
node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
godot4 --headless --path games/ice-run-godot -- --smoke-test
npm run build:native
./games/ice-run-godot/exports/linux/ice-run.x86_64 --headless -- --smoke-test
```

`godot4 --path games/ice-run-godot -- --capture` renders real gameplay, all four
cameras and menus to `/tmp/edgework-godot-*.png`. Capture and smoke saves are isolated
from the player's career. The checked-in screenshots are copied from this workflow.

## Boundaries and provenance

This is a substantive presentation rebuild of a playable development game, not a
claim of commercial AAA completion or measured skating fidelity. The athlete uses
procedural posing, not motion capture. Skirt motion is a visual approximation, not
cloth simulation. Reflections use a probe and procedural fixture sheen, not a live
planar mirror. The venue and crowd are procedural geometry, not scanned assets.

Development began on `phase17-assurance` at `a3c942e`, with existing native
scoring edits preserved and extended. Delivery was then integrated in a clean
`grand-prix-presentation` worktree based on current main `0392bf0`. The native
runtime was rebuilt from that integrated tree, retaining the newer `/39`
arrival/takeoff work. Browser conflicts preserve the tutorial, ghost, compact HUD
and Dig Gate. Native exposes four setups; not every browser UI has a native equivalent.

The physical double loop remains unresolved. The same eight failures occur before
and after integration; no replay fixtures were regenerated to hide them. Saved
research sessions and earlier character assets remain intact. See the
[session review](session-review-2026-09-27-grand-prix.md) and root handoff for details.

The generated model is authored by `games/ice-run-godot/tools/build_competition_skater.py`.
Its editable source and runtime export are included. Arena, shaders and UI are
repo-native assets; no generated promotional image substitutes for gameplay.
