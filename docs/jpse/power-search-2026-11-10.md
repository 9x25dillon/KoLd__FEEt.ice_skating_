# Power's entrances, and every style's landing windows: 10 November 2026

The hand-off's step 4: "Give Power its own entrance search." From `tools/ice-lab`:

```sh
npm run jpse:search -- --grid power --style power --mastery 1     # the grid
npm run jpse:search -- --grid power --style power --windows       # the check windows
npm run jpse:search -- --grid power --windows                     # the neutral skater
```

Experimental setup, on a sheet, the full stick, counter-clockwise. Mastery 0 is the day
a style is chosen (its cost in full, half its benefit) and 1 is fully drilled.

## 1. "Power lands none" was the measurement

The 9 November styles table had Power and Finesse landing none of the first grid's 225
double loops. That was not the skaters. The search recorded the pad script on the
neutral skater and replayed those inputs on the styled one. Two of the script's presses
are timed off the skater who records it, the way a player's are: the check comes a set
time after *its* takeoff, and the run-out follows *its* landing. Power flies longer, so
the check came at the wrong moment of its flight. Where the neutral skater fell, the
script had no run-out at all, and Power's inputs ended 30 ticks after a landing it had
made.

The search now records the script on the skater who skates it
(`loopBaselineProgram(knobs, params)`). For the neutral skater that is the same
program: its first-grid report is identical to `main`'s, field for field, apart from
the new `airTime` field.

Double loops landed on the first grid (225 entrances):

| skater | neutral skater's script (9 Nov) | its own script |
| --- | --- | --- |
| none | 2 | 2 |
| Power, chosen | 0 | 3 |
| Power, drilled | 0 | 4 |
| Finesse, drilled | 0 | 2 |
| Technician, drilled | 2 | 3 |
| Endurance, drilled | 1 | 1 |

`npm run jpse:styles` now prints the right-hand column. Its other jump columns moved
too, because more entrances leave the ice on a skater's own script (Power 40 to 45,
Finesse 45 to 65). The 9 November page keeps its figures and points here.

## 2. Power's grid

The first grid checked 0.35 to 0.45 s into the air and loaded for 0.4 s or more. Both
ranges stop short of where the easy entrances are, for every skater. `POWER_GRID` is 4
speeds (7 to 7.75 m/s), 6 loads (0.25 to 0.5 s) and 9 checks (0.35 to 0.55 s): 216
entrances, about 80 ms each, 10 of 10 repeats identical at every mastery.

| skater | left the ice | doubles landed | singles landed | mean height m |
| --- | --- | --- | --- | --- |
| none | 216 | 15 | 6 | 0.396 |
| Power, mastery 0 | 216 | 21 | 4 | 0.429 |
| Power, 0.25 | 180 | 20 | 3 | 0.440 |
| Power, 0.5 | 180 | 21 | 3 | 0.449 |
| Power, 0.75 | 180 | 15 | 2 | 0.457 |
| Power, 1 | 171 | 15 | 2 | 0.462 |

The hard gates take a single loop as a loop: a check about 0.25 to 0.35 s in lands one
turn. A count of "accepted" on a wide check axis therefore includes singles. The CLI now
prints each accepted entrance's revolutions (`1Lo`, `2Lo`, `3Lo`).

## 3. The check windows

A grid's check axis steps 3 ticks (25 ms) at a time, and most windows are 3 or 4 ticks
wide, so a grid can step over one. `checkWindows` skates every check tick from 0.2 s
to the landing, about 50 full candidates for each speed and load.

Each cell is the double loop's window: first to last check tick that lands it, and its
width in ticks (a tick is 8.3 ms). **No check** means the window runs to the landing:
the jump lands with nothing pressed in the air. A dash means no check lands a double.

| speed m/s | load s | neutral | Power chosen | Power half | Power drilled |
| --- | --- | --- | --- | --- | --- |
| 7 | 0.25 | — | — | — | — |
| 7 | 0.3 | **no check** (from 64) | 61–68 (8) | 60–66 (7) | 59–62 (4) |
| 7 | 0.35 | 56–62 (7) | 54–57 (4) | 53–55 (3) | — |
| 7 | 0.4 | 52–56 (5) | 50–53 (4) | 49–51 (3) | 48–48 (1) |
| 7 | 0.45 | 49–52 (4) | 47–49 (3) | 45–47 (3) | 45–46 (2) |
| 7 | 0.5 | 47–50 (4) | 45–47 (3) | 44–45 (2) | 43–43 (1) |
| 7.25 | 0.25 | — | — | — | **no check** (from 71) |
| 7.25 | 0.3 | **no check** (from 64) | 59–65 (7) | 58–62 (5) | 57–61 (5) |
| 7.25 | 0.35 | **no check** (from 59) | 53–56 (4) | 52–54 (3) | 50–52 (3) |
| 7.25 | 0.4 | — | 49–52 (4) | 48–50 (3) | 47–49 (3) |
| 7.25 | 0.45 | — | 47–49 (3) | 45–47 (3) | 44–46 (3); **3Lo** **no check** (from 67) |
| 7.25 | 0.5 | — | 45–47 (3) | 44–45 (2) | 42–44 (3); **3Lo** **no check** (from 65) |
| 7.5 | 0.25 | — | — | **no check** (from 70) | **no check** (from 68) |
| 7.5 | 0.3 | **no check** (from 63) | 58–63 (6) | 57–62 (6) | 55–60 (6) |
| 7.5 | 0.35 | **no check** (from 59) | 53–56 (4) | 51–54 (4) | 50–53 (4) |
| 7.5 | 0.4 | — | 51–54 (4) | 49–52 (4) | 47–50 (4) |
| 7.5 | 0.45 | — | — | — | — |
| 7.5 | 0.5 | — | — | — | — |
| 7.75 | 0.25 | — | **no check** (from 71) | **no check** (from 68) | **no check** (from 66) |
| 7.75 | 0.3 | **no check** (from 66) | 57–61 (5) | 56–58 (3) | stays down |
| 7.75 | 0.35 | — | 52–53 (2) | stays down | stays down |
| 7.75 | 0.4 | — | — | stays down | stays down |
| 7.75 | 0.45 | — | — | stays down | stays down |
| 7.75 | 0.5 | — | — | stays down | stays down |

What it says:

- **The neutral skater's double loop needs no check off a short load.** Load for 0.3 s
  at 7 to 7.75 m/s (or 0.35 s at 7.25 to 7.5) and it turns 2.0 to 2.1 and stands. The
  baseline entrance (7 m/s, a 0.5 s load, checked at 0.4 s) has a 4-tick window: it is
  about the hardest double on this grid that lands at all.
- **Power over-rotates.** Off the same loads it turns 2.2 to 2.9 unchecked, so on the
  day it is chosen it has one no-check double (7.75 m/s, a 0.25 s load) and every other
  double needs a check inside 2 to 8 ticks.
- **The window slides earlier as Power is drilled**, about a tick for each quarter of
  mastery, and narrows at 7 m/s (4 ticks to 1 off a 0.4 s load). A check learned on the
  day the style is chosen is late once it is drilled.
- **Power's entrance at every mastery: 7.25 to 7.5 m/s, a 0.3 s load, a check half a
  second in.** At 7.25 m/s ticks 59 to 61 land the double at all five masteries; at
  7.5 m/s ticks 58 to 60. At 7.5 m/s off a 0.35 s load only tick 53 does.
- **Drilled, Power shortens the load and stops checking:** a 0.25 s load lands the
  double unchecked from 7.25 to 7.75 m/s, 12 ticks wide at 7.75.
- **Drilled, Power lands the triple loop.** At 7.25 m/s off a 0.45 or 0.5 s load it
  turns 2.95 and 2.93 unchecked and stands. On the day it is chosen it turns 2.65 there
  and falls. The neutral skater's most on this grid is 2.39.
- **Power half-drilled or more stays on the ice at 7.75 m/s** with a load of 0.3 s or
  longer. Not traced yet.

## 4. The other styles

| speed m/s | load s | Finesse chosen | Finesse drilled | Technician chosen | Technician drilled | Endurance chosen | Endurance drilled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 0.25 | — | — | — | — | — | — |
| 7 | 0.3 | — | — | **no check** (from 64) | **no check** (from 64) | **no check** (from 66) | **no check** (from 65) |
| 7 | 0.35 | **no check** (from 58) | **no check** (from 58) | 56–62 (7) | 56–62 (7) | **no check** (from 57) | **no check** (from 57) |
| 7 | 0.4 | **no check** (from 54) | **no check** (from 54) | 52–57 (6) | 52–57 (6) | 53–59 (7) | 53–59 (7) |
| 7 | 0.45 | 50–55 (6) | 50–56 (7) | 49–53 (5) | 49–53 (5) | 51–55 (5) | 50–54 (5) |
| 7 | 0.5 | 48–53 (6) | 49–54 (6) | 48–51 (4) | 48–52 (5) | — | — |
| 7.25 | 0.25 | — | — | — | — | — | — |
| 7.25 | 0.3 | — | **no check** (from 65) | **no check** (from 67) | **no check** (from 67) | — | **no check** (from 69) |
| 7.25 | 0.35 | — | **no check** (from 57) | — | — | — | — |
| 7.25 | 0.4 | — | **no check** (from 56) | — | — | — | — |
| 7.25 | 0.45 | — | — | — | — | — | — |
| 7.25 | 0.5 | — | — | — | — | — | — |
| 7.5 | 0.25 | — | — | — | — | — | — |
| 7.5 | 0.3 | — | — | **no check** (from 67) | **no check** (from 68) | **no check** (from 66) | **no check** (from 65) |
| 7.5 | 0.35 | — | — | — | — | — | — |
| 7.5 | 0.4 | — | — | — | — | — | — |
| 7.5 | 0.45 | — | — | — | — | — | — |
| 7.5 | 0.5 | — | — | — | — | — | — |
| 7.75 | 0.25 | — | — | — | — | — | — |
| 7.75 | 0.3 | — | — | — | — | — | — |
| 7.75 | 0.35 | — | — | — | — | — | — |
| 7.75 | 0.4 | — | — | — | — | — | — |
| 7.75 | 0.45 | — | — | — | — | — | — |
| 7.75 | 0.5 | — | — | stays down | stays down | — | — |

- **Every style has a no-check double on the day it is chosen**: Finesse at 7 m/s off a
  0.35 or 0.4 s load, Technician off 0.3 s at 7 to 7.5 m/s, Endurance at 7 m/s off 0.3
  or 0.35 s and at 7.5 off 0.3.
- **Finesse has the widest checked windows** (6 or 7 ticks where the neutral skater has
  4) and jumps only at 7 m/s until it is drilled. Slower and steadier, as its blurb says.
- **Technician is the neutral skater with less whip**: the same windows at 7 m/s, fewer
  entrances above it.
- **Endurance loses the 0.5 s load**: its smaller takeoff turns 1.67 there.
- Above 7 m/s with a load of 0.35 s or more, every skater but Power turns 1.2 to 1.6
  and falls. The rule behind that drop has not been traced.

## 5. Balance, as measured here

On the double loop the styles do what they say, and none is shut out. Power is the hard
one on its first day and the only one with a triple. No style number was changed.

This is the double loop only. What a style is worth over a season (scores, medals,
falls in a full program) has not been measured.

## 6. A limit found the same day: the music is in these numbers

Every figure on this page was measured on the default beat grid: 128 bpm, counted
from the try's first tick. That matters on Experimental. Backward on a deep edge the
skater strokes a crossover by itself on every beat of the music
(`game/full-controls.ts`, `autoCrossover`), so each recorded entrance has those
pushes in it, at that grid's moments.

The jump lesson's work (branch `jump-lesson`, same day) measured what that does to
one entrance, a double loop from 6.6 m/s: the same hands land it 7 times in 10 when
the try starts at any moment of a 128 bpm track, 2 in 10 on the first shipped track
(54.3 bpm), and every time when the try starts so that a beat falls where the
default grid put it.

The windows above have **not** been re-measured at the tracks' tempos (54.3 to
68.1 bpm). Read them as what the styles do relative to each other on one grid, not
as timings to play by.

## 7. For the tutorial

- Teach the neutral skater's no-check double first: 7 m/s backward on the deep back
  outside edge, a short load (about a third of a second), and nothing in the air. The
  loop ghost and the baseline both show the checked, 4-tick version.
- The check is a second lesson. Its window is 33 to 67 ms wide and nothing on screen
  shows it today.
- Power needs its own words: the check on the day it is chosen, a shorter load once
  it is drilled.
