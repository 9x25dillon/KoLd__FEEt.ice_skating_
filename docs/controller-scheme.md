# Three gameplay controller setups

The browser Controls menu, Godot Settings and browser controller workshop now offer
three complete setups. Selecting one changes both input mapping and assistance;
the game starts a fresh run so its recording includes the actual parameters.
The old mappings remain available as custom overrides. The lab's blind A/B/C
experiment remains unchanged.

| Setup | Continuous control | Assistance and move access |
| --- | --- | --- |
| Simulation | Left/right sticks control the corresponding blades: each stick's side-to-side is its blade's tilt and its fore–aft is that blade's heel/toe. LT bends the left knee, RT the right; the standing leg's knee sets load and jump, the pushing leg's sets the push. The feet turn in the hips (feet layout below). Blades scrape, dig and catch (slip), the arms twist the trunk (torque), and stops — snowplow, T-stop, hockey stop — come from the feet and edges: there is no pad brake (keyboard X still brakes). Through a turn each held stick keeps its side of the ice until that stick is released. Hold the profile's modifier (L3 by default) for right-stick arms and wind-up; the right blade retains its last command until release. | Responsive athlete balance model, no jump assist, no landing coach, no Cruise or held-repeat strokes. Manual turn gestures. |
| Blade Explorer | Left stick directly controls lean and rocker pressure; right stick controls arms, which twist the trunk. Blades stay parallel but scrape, dig and catch. Bumpers retain the chosen foot. | 50–100% assistance, default 75%: blends balance damping/recovery and latency toward the assisted preset, and blends excessive lean toward a speed-dependent blade-support limit. Manual jump landings and turn gestures. |
| Full Repertoire | Left-stick lean/pressure, right-stick arms, retained foot selection. | Assisted balance, wind-up jump assistance, dedicated turn/glide commands, optional landing coach in the game. Covers implemented moves; entries must still be physically available. |

All three start with Cruise off. Explorer and Repertoire can enable it and repeat
strokes while A is held. Simulation requires each press. RT loads/releases, LT
brakes (in Simulation: LT/RT are the left/right knees and D-pad ↑ brakes), R3 plants the toe or changes spin foot, X twizzles and Y spins. Modifier
+ X/Y/A selects Ina Bauer/spiral/cantilever. Start a spin before engaging the
modifier to adjust arms/camel in Simulation; the button bank stays latched.

For manual turns, tap B for a three-turn, transfer feet for a mohawk, hold B for
a loop, or reverse lean during the first half for a rocker. Transfer plus reversal
produces a choctaw. D-pad down requests a bracket; hold it and reverse lean for
a counter. Dedicated loop/rocker/counter/mohawk/choctaw shortcuts apply only in
Repertoire. The corresponding keyboard controls are B/N plus Q/E and lean inputs.
Simulation keyboard: A/D left blade, left/right arrows right blade, W/S pressure
(shared by both blades), Shift both knees, X brake,
C arms, comma wind-up. Explorer keeps A/D or arrows for lean.

These are authored tuning starting points, not external physics validation.
Simulation keeps the feedback controller representing the athlete's muscles;
removing it would not provide direct anatomical control. The model still has
one body lean and one shared fore–aft pressure channel. Hype assistance is off
in the three setups to keep their selected assistance consistent. Blade geometry,
friction, jump impulse and landing shock are not increased for easier play.

Use the workshop at **http://localhost:8123/game/controller.html** to compare the
same forward/backward entry in each setup, with raw axes, mapped lean/split,
pressure and observed moves visible. Save stores setup and assistance in
`edgework-skating-setup-v1`, alongside the existing controller profile. Reload the
browser game to apply it. Profile JSON transfers sensitivity/bindings only; choose
the setup and assistance separately in Godot. The workshop does not run the game's
optional landing coach.

Automated coverage includes raw-input blade/arms switching, per-stroke Simulation,
Explorer lean limiting, manual turns, physical load/release jumps, replay checks,
and matching browser/Godot state for all three setups. Physical-pad comfort still
needs hands-on testing.

## Full Repertoire bindings

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
   Saving also stores the selected gameplay setup and assistance; reload the game.

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
Replay frames use scheme label **D**. The solver contract is `ice-lab-f64/30`. The three setups record final mapped
inputs and parameters under label D; they add no solver arithmetic changes. Older
builds reject D-labelled clips; current builds continue accepting A/B/C clips.

Defaults are authored starting points. Virtual-pad and automated checks establish
reachability and consistency; a human session on a physical controller is still
needed to assess comfort, stick noise, and suitable sensitivity.


## Feet (Simulation)

Each foot turns in its hip — out as far as the skater's turnout, in about 35° — and the
blades point off the body by those angles. Three layouts, chosen in the controller workshop
(`/game/controller.html`, "Feet (Simulation)") and saved with the profile; default D-pad.

| Layout | Pad | Holds when released? |
| --- | --- | --- |
| **D-pad nudges** | D-pad ← / → turn both feet together (anticlockwise / clockwise); modifier + ← / → toes in / out; ↑ straightens | yes |
| **Stick up/down** | each stick's up/down turns its own foot (up toe out, down toe in); hold the modifier for heel/toe on the left stick | no — the stick is the angle |
| **Modifier + left stick** | hold the modifier: left stick x turns both feet, y toes in / out; the left blade keeps its last edge and the right stick is the arms | yes |

Keyboard, every layout: `[` / `]` turn both feet, `-` / `=` toes in / out, `\` straightens.

Snowplow: both bumpers (shared weight), toes in, blades on their inside edges. T-stop: weight
on one foot, the other turned out behind on its outside edge. Hockey stop: rise off a carve,
release the shoulders into the turn with the feet turned, sink and hold the blades square to
the travel (feet, then hips). Which stick direction reads as "knees in" on screen is still to be
checked on the pad: in the model's frame, sticks pushed apart put both blades on their inside
edges; pushed together, on their outside edges, which catch.
