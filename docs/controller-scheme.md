# Three gameplay controller setups

The browser Controls menu, Godot Settings and browser controller workshop now offer
three complete setups. Selecting one changes both input mapping and assistance;
the game starts a fresh run so its recording includes the actual parameters.
The old mappings remain available as custom overrides. The lab's blind A/B/C
experiment keeps its labels. Since 2026-09-24 its scheme C — and the old Two-foot
control override, which shares that mapping — holds L3 for right-stick arms as
Simulation holds its modifier: the right blade keeps its last command until L3
is let go. The lab's next course is keyboard G only; L3 no longer changes it.

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

**Pushing (Simulation, Blade Explorer, Full Repertoire, since 2026-09-24):** A pushes from the leg you
stand on; both blades are down through the push, then the weight goes to the other foot, so the next
push is the other leg's — the same rule as Experimental's strokes. From a standstill, A every 0.5 s:
about 1.1 m/s after 4 s with the knees straight, 2.5 m/s with them bent to 0.65 (a deeper knee is a
stronger push). The bumpers still choose a foot.

**Game HUD:** compact; the backquote key (`` ` ``) hides it, `/` toggles the AI ghost.

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
Replay frames use scheme label **D**. The solver contract is `ice-lab-f64/39`. The three setups record final mapped
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

**The toe pick** (`toePickMode`) — **off in every setup** since the afternoon of 2026-09-24, on
the operator's word after play ("not working at all"; "makes pumping completely useless"). It was on
in Simulation and Experimental that morning; what it did, for the record: going
forward faster than 1.5 m/s with a loaded blade's contact 0.11 m or more toward the toe, the pick
catches and the skater trips. A stick held full forward (toe) at speed does it; so does braking
too suddenly, since the ankle rides a sudden stop by driving the contact toward the toe — both
outside edges caught, or a snowplow slammed on: set its edges over 0.1 s or more (measured,
3–7 m/s) and it holds. Rocking back is the same: both sticks yanked to the heel (90% at once, or
full within 0.1 s) catch the pick, because the ankle leans the body back by first pushing the
contact toward the toe; eased over 0.2 s it holds. Backward the pick trails and never trips.

**The dig and the lean** (pendulum on): the dig pushes where the ankle has the contact, which
trails the stick by about a second. Lean toward the toe (or heel) *before* the blade goes across —
a toe lean held short of the pick, 75% — and the dig winds the body; lean at the dig and it
winds the other way. The lab's overlay rings the asked contact on each blade and lights `DIG`.


## Experimental (the operator's)

The legs on the triggers, the feet and blades on the thumbs, weight and arms on X / B, the
toe picks on the stick clicks, and A / Y asking for moves that the physics then performs or
refuses. Everything through the blades (slip, trunk, feet), minimal assistance, no Cruise.
The other three setups are unchanged.

| Input | Does |
| --- | --- |
| LT / RT | left / right knee: pull to bend. **Pump** — past 60% then back under 20% within 0.25 s — is that leg pushing, as strong as the bend was deep and the snap quick; the push extends the leg from that bend. Load the standing leg and let go: the jump |
| Left / right stick | that foot and blade: side to side the edge, up/down heel/toe. A **thumb stroke** — down past 50% then up past 50% within 0.25 s (after the deadzone and curve: about 70% of the stick's travel) — is that foot pushing, as strong as it was full, straight and quick, judged forgivingly: three-quarters down to three-quarters up in 0.1 s is a full push, a little wobble is free. A stroke is a whole-leg push: it extends the leg from a full bend (`STROKE_KNEE`), whatever the triggers are doing, so a clean stroke pushes as hard as a full pump (before 2026-09-24 it pushed from the trigger as it stood — released, a third of a pump). The stick is still that blade's heel/toe, so a stroke yanked to the stick's ends catches a pick (going faster than 1.5 m/s): past about 85% down the ankle throws the *other* blade onto its pick; from deep down all the way to the top, the pushing blade's own — the toe push |
| Pump + thumb stroke, same leg, within 0.125 s | add, up to a full push, from the deeper of the two bends |
| **Strokes switch feet** | on one foot, the leg you stand on pushes, whichever trigger or stick you snap (a lifted leg has nothing to push against); both blades are down through the push, then the weight goes to the other foot and stays, and the leg that pushed is free — so the next push is the other leg's. From a glide, start with the free leg's trigger: the standing trigger is the jump's load. While stroking (within 1 s of a push) a snap of the standing trigger is the next push; hold it past 0.25 s for the jump. With shared weight each trigger pushes its own leg |
| X / B | weight to the left / right foot (it stays), arms swing left / right (eased, not a flick); both: shared weight |
| Free leg's trigger | with the weight on one foot the other leg is free: held, its trigger swings it forward (released, it rests) — the swing starts once the press outlasts 0.25 s; snapped (pulled and let go within 0.25 s) it is a push from the standing leg and the leg stays at rest (a snapped swing spun the skater round). Smooth and over a deep edge it adds spin its own way round (a right free leg with the jump); snapped, it twists the blade loose |
| L3 / R3 | toe pick |
| A | turn: the three-turn gesture; LB + A bracket; RB + A cantilever |
| Y | rotation: spin; LB + Y twizzle; RB + Y spiral; LB + RB + Y Ina Bauer |
| D-pad | the feet (D-pad layout): ← / → turn both, LB or RB + ← / → toes in / out, ↑ straightens |
| (automatic) | **back crossovers**: skating backward at 1.5 m/s or more, leaning at least `crossoverLean` (12°), the skater strokes a crossover on every beat of the music — on the beat, so never the chopped off-beat push — as an ordinary stroke from the knee, both blades down for the push. Bent knees stroke harder. Holding both knees deep past the jump's load (0.7 on the standing leg; with shared weight, the average) loads a jump instead |

Measured from 3 m/s over 1 s: glide 2.891; one deep snapped pump 3.175; one lazy pump 2.931;
one firm thumb stroke (75% to 75%) 3.171 (was 2.985 when a stroke pushed from the released trigger). From a
standstill, triggers released, a right-stick stroke every 0.5 s: 1.977 m/s at 4 s, the pushes alternating feet —
the same as snapping LT, RT in turn (1.978); was 0.509. Alternating full pumps every 0.25 s for 2 s: 3 → 4.061 m/s, with
no takeoff. Backward on a curve (sticks 0.65, knees 0.6), the automatic crossovers take 3 → 6.13 m/s
in 8 s with no pumping (knees 0.3: 4.59). Pumps on a curve are crossover pushes and follow the bible's beat rule:
off the beat they are chopped to 45%. The thresholds and weights are authored starting points for tuning on the pad
(`game/full-controls.ts`: `PUMP_*`, `STROKE_*` including `STROKE_KNEE`, `GESTURE_TICKS`, `PAIR_TICKS`, `SNAP_TICKS`,
`ARMS_*`).


## Dig Gate (a fifth setup, 2026-09-24)

Experimental's athlete and every Experimental binding, plus a **phase-gated dig** on **LB + RB**
(held, with no A or Y). The gate only asks; the blades dig or don't.

| Phase | What the controller asks |
| --- | --- |
| idle | nothing |
| wait | going forward, nothing — it waits for you to skate backward (forward, the dig threw the skater down 10 times in 10, 3–7 m/s) |
| lean | the toe, eased in to 0.4 over 0.5 s; then it waits until the contact the ankle actually has is within 0.02 of the asked (the lean begun early) — timeout 1.5 s |
| dig | both feet turned against the curve (toeOutSplit toward the lean) for 0.5 s; the scraping blades wind the body |
| recover | the lean eased back out over 1 s |

Let go of LB + RB during the lean and it eases back out without digging. The game's stance line and
the controller workshop show the phase ("Dig · leaning to the toe 0.40", "Dig · digging · winding").
Measured from the pad (`test/diggate.test.ts`), backward 3–7 m/s, either lean: the dig starts at 1.5 s,
winds the body the way it curves (0.61–0.76 N m s) and the skater stays up every time. Constants in
`game/full-controls.ts` (`DIG_*`), all measured on the Experimental athlete.


## Elite Series 2 paddles (Experimental and Simulation, 2026-09-24)

Firefox reports the Xbox Elite Series 2's four back paddles as buttons **18–21**, past the standard
layout, so no move binding touches them. They are a **lower-body layer**, bound in the controller
workshop's *Elite paddles* card and saved in the controller profile (`paddles`, one layer per setup;
a profile saved before them loads with the defaults). They act in **Experimental and Simulation
only** — Dig Gate, Blade Explorer, Full Repertoire and the Ice Lab page ignore them — and the D-pad
keeps working alongside them.

| Index | Assumed position | Experimental default | Simulation default |
| --- | --- | --- | --- |
| b20 | top-left | feet anticlockwise | feet anticlockwise |
| b18 | top-right | feet clockwise | feet clockwise |
| b21 | bottom-left | left free leg | weight left |
| b19 | bottom-right | right free leg | weight right |

Each action is exactly an existing control. **Feet** anticlockwise / clockwise: D-pad ← / → without
the modifier (in the D-pad and modifier feet layouts; the stick layout's sticks hold the feet
themselves); with the D-pad the same way the feet still turn at one rate. **Free leg** (Experimental
only): held, that leg swings fully forward at once — a paddle is never a push, so there is no snap
window to wait out; released, it rests; the standing leg's paddle does nothing; with the trigger also
swinging it, the stronger swing wins, and a snap of the trigger is still a push. **Weight** left /
right: X / B in Experimental (without the arm swing), LB / RB in Simulation. **Toe pick** left /
right: L3 / R3 in Experimental, the toe binding in Simulation (the solver has one toe-pick channel,
so both ask the same pick).

Presets, one click each, matching the operator's Elite profiles — the top paddles turn the feet in
all three: **Skating / stops** (bottom: free legs; Experimental's default), **Weight shift**
(bottom: weight left / right; Simulation's default), **Toe picks** (bottom: toe picks). Simulation
has no free leg (`freeLegMode` 0), so its layer cannot hold one and Skating / stops is not offered
there: a layer per setup, rather than a free-leg paddle that silently does nothing or turns into
something else.

**Verify the positions.** Which index is which paddle is assumed from the Linux xpad driver's P1–P4
order, not measured. In the workshop, press each paddle and watch the *Raw gamepad probe* card: the
index it lights should be the one its row names ("b20 · top-left"), and that row turns teal while
held. If one is wrong, swap the two rows' actions and save.

With the paddles the thumbs never leave the sticks: from 6 m/s, both sticks held at 0.6 and both
knees at 0.6, the top-left paddle turning the feet against the curve for a second scrapes the skater
to 4.04 m/s at 4 s (straight feet: 5.05), the edges the sticks' throughout — a turn-and-scrape, not
a full stop, which still needs the feet held square as the travel swings (`test/paddles.test.ts`).
