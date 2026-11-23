# Career difficulty: where a season stalls (2026-11-23)

Measured with `games/ice-run-godot/tools/career_difficulty.mjs` (new): every career event skated by
`tools/rival_baseline.mjs`'s scripted pilot on Simulation, fresh skater, over 7 orbit radii × 3 jump entries
(21 runs; 7 for jumpless events). Medal = complete + falls (`game/career.ts`). The pilot is a patient,
competent script, not a human; its numbers are an upper bound for a first-time player.

## The ladder, as the pilot skates it

| # | Event | Runs | Gold | Silver | Bronze | Unfinished | Where unfinished runs stop |
|---|---|---|---|---|---|---|---|
| 0 | First ice | 7 | 7 | 0 | 0 | 0 | |
| 1 | Club debut | 7 | 7 | 0 | 0 | 0 | |
| 2 | Jump showcase | 21 | 18 | 3 | 0 | 0 | (3 falls after the last element) |
| 3 | Regional spotlight | 21 | 21 | 0 | 0 | 0 | |
| 4 | Championship program | 21 | 6 | 1 | 0 | **14** | the **second** jump (89 falls on it) |
| 5 | Sectional qualifier | 21 | 21 | 0 | 0 | 0 | |
| 6 | Autumn Trophy | 21 | 0 | 0 | 0 | **21** | the **second** jump, all 21 |
| 7 | Northern Cup | 21 | 0 | 0 | 0 | **21** | the second jump 18, a crossover 3 |
| 8 | Nationals | 21 | 0 | 0 | 0 | **21** | the second jump 18, a crossover 3 |
| 9 | Exhibition gala | 7 | 5 | 1 | 0 | 1 | the pose |

Every one-jump event is gold-able. Every event with a second jump stalls on that jump; the first jump of the
same programs always lands.

## Why: rotation follows the legs (stamina), not the entry speed

The career's jump element needs half a revolution, landed clean (`JUMP_TURN` 0.5). Isolated in the solver,
Simulation, the course's own jump technique (sticks 0.5, L3 + arms, LT+RT 0.3 s, soft knees), `s.legs` set:

| Legs | Revolutions, entry 2.8–5 m/s |
|---|---|
| 1.00 (fresh) | 0.57–0.64 |
| 0.88 (where the finale's second jump starts) | 0.48–0.54 |
| 0.70 | 0.38–0.43 |

In the finale the pilot takes off for the second jump at legs 0.88 and under-rotates (0.34). Each failed try
spends more legs (pushes, the take-off, the fall): 0.88 → 0.77 → 0.62 → 0.50 → 0.40 over five tries, and the
turn falls with it (0.37 → 0.28). Legs recover at `staminaLegsRecover` 0.0008/s of easy gliding: 0.1 takes
about two minutes, longer than the time left in any program.

Training is meant to answer this, but buys little. With spring (jump impulse and arm pull-in) trained:

| Spring | Legs 0.88 | Legs 0.80 | Legs 0.70 |
|---|---|---|---|
| 50 (new) | 0.48–0.50 | 0.44–0.45 | 0.38–0.40 |
| 60 | 0.51–0.53 | 0.46–0.48 | 0.42–0.43 |
| 70 | 0.55–0.57 | 0.50–0.51 | 0.44–0.45 |
| 80 | 0.58–0.60 | 0.52–0.54 | 0.47–0.48 |

A season of silver medals buys about ten stat points in all (`EVENT_FLOORS` notes), and the floors steer them
into edge control. Ten points of spring only rescues the jump at 0.88 legs; at 0.8 it needs 70–80.

## What was tried and is not an answer

- **Reordering the program so the jumps come first** (plans allow any order): the finale went from 7/21
  finished to 0/21, Autumn Trophy from 0/21 to 1/21. This is confounded: after a jump the pilot lands backward
  and only turns forward after a spin, so a jump-first plan has it skating the next edge and jump backward.
  It doesn't show whether a person would gain from it.

## Caveats

- One scripted technique per setup. More arms or a deeper load may turn more; the table is the course's
  own words, which is what a player is told to do.
- Simulation only. The other setups weren't run.
- The isolated table is kinder than the career itself. In the finale the pilot turned 0.34 at legs 0.88, where the
  isolated solver gives 0.48–0.54. The career bridge adds the career's parameters (undrilled arms, music, rink
  boards, its own entry), and I haven't split out which of those costs the rest.
- The pilot doesn't turn forward after a jump (see above); runs where the second jump's entry was backward
  (`fwdcos -1`) fall for that reason too.

## Decisions for the owner (none taken)

Each of these is either a loosening, a physics change, or authored content, so the hand-off rules leave them to you:
1. **The jump bar under fatigue:** e.g. `jumpBar` relaxing with spent legs (a loosening of the 2026-11-02 rule).
2. **Stamina in a program:** a faster `staminaLegsRecover`, or a cheaper jump. Physics, so behind a mode, off by default.
3. **Season two's routines:** fewer jumps, or jumps placed after a rest (authored content; the comment in
   `CAREER_EVENTS` records the owner's earlier choices).
4. **Training:** let spring or stamina weigh more in `overall()` so the floors stop steering every point into edge control.
5. **Tell the player:** show legs in the HUD and have the coach say when a jump is out of reach until they've rested.
   Presentation only, but it doesn't remove the wall.

Re-run: `node games/ice-run-godot/tools/prepare.mjs --engine-only && nice node games/ice-run-godot/tools/career_difficulty.mjs --json=out.json` (about 10 minutes).
