# Full repertoire controller scheme

Full repertoire is the fourth **game** scheme, available in the browser's Controls
menu and Godot's Settings. The instrument's blind A/B/C experiment stays separate.
Choose Full repertoire explicitly; existing control schemes remain available.

## Default layout

Button names use Xbox labels; the workshop also shows PlayStation equivalents.

| Action | Controller | Keyboard |
| --- | --- | --- |
| Lean / fore-aft pressure | Left stick | A/D, W/S or arrows |
| Select and retain left / right foot | LB / RB; both for shared weight | Q / E; both for shared weight |
| Push, crossover on a curve, recover from a fall | A | Space |
| Brake | LT | X |
| Load and release a jump | RT | Shift |
| Open arms / wind-up | Right stick / flick right | C / comma |
| Toe pick; foot change during a spin | R3 | F |
| Three-turn | B | B |
| Mohawk | Hold L3, then B | H |
| Bracket | D-pad down | N |
| Loop turn | D-pad up | J |
| Rocker turn | D-pad right | K |
| Counter | D-pad left | L |
| Choctaw | Hold L3, then D-pad right | G |
| Twizzle | Hold X | Hold Z |
| Spin | Hold Y | Hold Y |
| Sit / camel during a spin | RT / right stick forward | Shift / W |
| Ina Bauer | Hold L3, then hold X | Hold I |
| Spiral | Hold L3, then hold Y | Hold O |
| Cantilever | Hold L3, then hold A | Hold U |
| Pause / restart | Start / Back | P / R (Godot also uses Esc to pause) |

L3 can be swapped for R3 in the workshop. Move bindings can use either button bank;
assigning an occupied binding swaps the two actions. Triggers, bumpers, Start and
Back retain their continuous-control and session roles. Keyboard shortcuts are fixed.
The bank is latched when a move button goes down, so releasing the modifier first
does not trigger another move. Release the move button before changing banks.

Turns can be tapped or held. The mapping performs the existing input gesture for
the requested turn: entry pulse, held pivot, weight transfer for a mohawk, lean
reversal for a rocker/counter, or both for a choctaw. It emits ordinary `SkatingInput` values and never
writes a move, blade, score, or skater state. Speed, an established edge, and the
solver's entry conditions still decide whether a turn starts. A failed entry is
not queued; establish the edge and press again. Continuous moves end on release.

Jump type still comes from takeoff foot, edge, direction and toe assistance.
Full repertoire does not map J/D-pad up to the Beginner shortcut: those controls
request a loop turn. The game's on-screen Beginner shortcut remains available.
Unimplemented pose variants require further mechanics; this scheme
covers the implemented repertoire, not every move in the design documents.

## Controller workshop

From the repository root:

```sh
node tools/ice-lab/app/build.mjs
node tools/ice-lab/app/serve.mjs
```

Open **http://localhost:8123/game/controller.html**. The game's Full repertoire
control guide links there too.

1. Choose Controller + keyboard, or Virtual controller if a physical pad is absent.
2. Reset forward or backward. The test starts at 6.8 m/s with Cruise off.
3. Establish a shallow edge for about two seconds, then request a move. A useful
   virtual-controller starting point is left X = −0.50, RT = 0.38.
4. Compare requested action, observed move, raw/shaped axes and solver input. The
   trace and last-completed-turn readout make brief turns inspectable afterwards.
5. Adjust stick deadzone, response curve, lean sensitivity, keyboard lean or trigger
   deadzone. These are control mappings, not modifications to the solver constants.
6. Save for the browser game, or export a controller profile for another install.
   Saving does not change which scheme is selected: pick Full repertoire in Controls.

Virtual axes stay set; each virtual button toggles its actual held state. Hold the
modifier first for extra moves. Release all controls clears the virtual pad.
Pause freezes skating; the raw hardware monitor continues to report input.
Export this skating replay captures the mapped inputs for deterministic verification.

Browser profiles use `localStorage` key `edgework-controller-v1`; scheme selection
uses `edgework-control-scheme`. Unavailable storage leaves controls usable for the
current session. Profile JSON is versioned, bounded and rejects duplicate bindings,
reserved buttons and invalid numbers. Import previews a profile; Save applies it.

In Godot, **Settings → Controller tuning & bindings** provides sensitivity sliders,
the current binding list, profile import/export, defaults, and **Use Full repertoire
& save**. Import the workshop's JSON to transfer remapped buttons. Both runtimes use
`game/full-controls.ts`; Godot supplies raw axes and explicitly translates its button
enum into Standard Gamepad ordering before sending input to the Node bridge.

## Verification and limits

Automated tests drive raw controller inputs through the mapping and real solver,
check all six turn classifications, forward/backward keyboard operation, glides,
spin positions and foot changes, toe-assisted jumps, held-button behavior, profile
validation, Godot batch parity, and exported replays. The native smoke path is:

```sh
node games/ice-run-godot/tools/prepare.mjs --engine-only
godot4 --headless --path games/ice-run-godot -- --smoke-test --full-controls
```

First-time Godot setup still requires the full preparation command to generate audio.
Replay frames use scheme label **D**. The solver contract is `ice-lab-f64/21`:
only accepted mapping metadata expanded, and the pinned fixture is unchanged. Older
builds reject D-labelled clips; current builds continue accepting A/B/C clips.

Defaults are authored starting points. Virtual-pad and automated checks establish
reachability and consistency; a human session on a physical controller is still
needed to assess comfort, stick noise, and suitable sensitivity.
