# Grip search: does a shoulder wind add angular momentum to a jump?

## The answer

**Yes, but only about +5 kg m²/s, and only with the arms in.** With the feet held on a good edge and the arms in, a takeoff that leaves while the shoulders are still swinging the jump's way gains up to about 5 kg m²/s over the same takeoff unwound (best measured +5.34, L 9.62 to 14.96). That can turn a short jump into a clean single, but in the cases checked it did not buy a clean double.

The gain comes from the ice. In the best pairs, the gain, the twist term in `bodyRate` and the extra ice impulse agree to about 0.2 kg m²/s (the quality factor accounts for most of what is left), and the feet never pivot or skid. So the rule in `jump.ts` holds: the ice holding the feet while the shoulders swing does make spin.

Three limits:

- **Winding and holding pays nothing.** In the four best pure-twist pairs, the gain with the wind held through the release is -0.64 to 0.00. The shoulders must still be moving when the blade leaves.
- **It does not stack with the arms.** Once the arms are out, the arms and the trunk share one 60 N m trunk ceiling. Where wound and unwound both held with arms out, the wind added 0.50 to 1.75.
- **It does not raise the best achievable jump.** Unwound takeoffs with arms out, climbed just as hard, reach about 29 to 32 on most edges where a comparison worked. The highest wound takeoff with the feet held is 32.36.

**Larger gains exist but are a different effect.** Pairs reach +29 (L 0.00 to 29.24), but the twist term there is about zero. The unwound twin lost its grip and pivoted, and the wind kept the feet held so the arm swing reached the ice. An unwound takeoff with a different load and heel/toe can often hold as well.

**The pure effect is not on the pad as mapped.** It needs the arms in, and the pad ties carriage to the wind (see Caveats).

All numbers come from the sim, which is **not validated against real skaters**. They say what this model does, not what a skater does.

## How to read the tables

- L is `J.angMomentum` at takeoff, kg m²/s. A pair is one input with `windup` on, and the same input tick for tick with `windup` zero.
- "Held" means no tick of the load pivoting, no tick skidding, and not skidding on the last tick before blade-off.
- "Jitter" is 60 reruns with timing ±2 ticks, wind depth ±5%, speed ±0.15 m/s, lean, knee, carriage and pitch ±0.02 to 0.03. It reports min/median/max gain and how many of the 60 pairs lacked a takeoff in one of the two runs (a fall, or no release). The tables mark these "no TO".
- Sim runs at 120 Hz, so 2 ticks is about 17 ms.

## Best pairs: the pure twist effect (both held)

Every row has `yawDev` 0, `latSlipAccel` 0 and the Edge regime at takeoff, with no pivot or skid ticks in either run. Carriage is at most 0.03. The climb drove it there by itself. All rows but the first came from the climb, which scored the worst of six jittered runs and so favours steady cases over the single highest gain.

| Setup, jump | v m/s | lean frac | L unwound | L wound | Gain | Twist term | Extra ice impulse | twistRate | Jitter min/med/max (no TO) |
|---|---|---|---|---|---|---|---|---|---|
| Experimental Lo, plain recipe (below) | 6.00 | 0.90 | 9.62 | 14.96 | **5.34** | 5.28 | 5.28 | 9.61 | 3.89/5.12/5.69 (0) |
| Explorer T | 4.19 | 0.85 | 6.82 | 11.54 | **4.72** | 4.69 | 4.69 | 8.50 | 4.16/4.65/5.16 (4) |
| Experimental T | 6.02 | 0.89 | 8.78 | 13.48 | **4.70** | 4.86 | 4.86 | 8.84 | 3.96/4.77/5.57 (0) |
| Explorer Lo | 2.29 | 0.36 | 4.25 | 8.91 | 4.65 | 4.88 | 4.88 | 8.53 | 3.73/4.46/5.00 (0) |
| Experimental Lo | 4.79 | 0.74 | 8.12 | 12.57 | 4.46 | 4.51 | 4.51 | 7.84 | 3.81/4.48/5.12 (0) |
| Explorer S | 3.51 | 0.51 | 6.32 | 10.74 | 4.42 | 4.42 | 4.41 | 7.35 | 3.10/4.50/5.00 (0) |
| Explorer F | 2.00 | 0.11 | 2.62 | 6.70 | 4.08 | 4.11 | 4.11 | 7.46 | 3.10/4.06/4.61 (0) |
| Simulation Lo | 3.33 | 0.37 | 5.19 | 9.16 | 3.97 | 4.12 | 4.16 | 7.49 | 1.54/3.98/4.35 (0) |
| Simulation F | 5.23 | 0.90 | 8.99 | 12.62 | 3.63 | 3.70 | 3.70 | 6.27 | 3.17/3.68/4.14 (0) |
| Experimental F | 4.05 | 0.49 | 7.08 | 10.22 | 3.14 | 3.09 | 3.15 | 5.28 | 2.63/3.12/3.64 (0) |
| Explorer A | 4.46 | 0.71 | 7.19 | 10.17 | 2.98 | 3.06 | 3.06 | 5.56 | 0.59/2.78/3.23 (0) |
| Simulation S | 5.35 | 0.89 | 9.35 | 12.28 | 2.93 | 2.97 | 2.93 | 4.80 | 2.56/2.95/3.22 (0) |
| Simulation A | 4.93 | 0.54 | 6.77 | 9.65 | 2.88 | 2.87 | 2.86 | 5.10 | 2.42/2.80/3.26 (0) |
| Experimental A | 5.52 | 0.92 | 9.67 | 12.14 | 2.46 | 2.45 | 2.45 | 4.03 | 2.17/2.51/2.80 (0) |
| Experimental S | 5.01 | 1.00 | 9.19 | 11.40 | 2.21 | 2.23 | 2.22 | 3.46 | 1.94/2.21/2.47 (10) |
| Simulation T | 3.96 | 0.49 | 6.95 | 8.93 | 1.97 | 1.99 | 1.99 | 3.33 | 1.74/2.01/2.26 (0) |
| Any setup, Lz | | | 0.00 | 0.00 | 0.00 | -0.71 to 1.32 | same as twist | | clamped |

**The lutz gets nothing.** Its entry curves clockwise, so `max(0, ...)` reads 0 both ways. The twist term is there, but it does not lift the total above zero with the arms in.

### Outcome for the best pair (Experimental T)

| | Height m | Quality | Turned, tucked to the ice | Best landing across check times |
|---|---|---|---|---|
| Unwound | 0.340 | 0.77 | 0.78, called a quarter short, not standing after 1 s | 0.37 turned, no jump called, not standing |
| Wound | 0.340 | 0.77 | 1.20, called as a downgraded double, fall | 0.96 turned, 1T called clean, no fall, **standing**, landing quality 0.64 (check 0.40 s) |

Height and quality do not change, so the wind costs nothing on the way up.

The highest-gain case tells a less flattering story. In the plain Loop recipe (+5.34), the unwound takeoff already lands a clean single standing (1.00 turned, landing quality 0.65). The wound one, tucked to the ice, turns 1.55 and falls, called an under-rotated double. Its best check is a clean single again (0.98, landing quality 0.61). So at this size the gain does not reach the next revolution.

### Which part of the wind pays (same Experimental T case)

| Variant | Gain |
|---|---|
| As found: wound +1, let go through to -1, blade leaves at the end of the swing | 4.70 |
| No wind first, only the swing the jump's way | 2.34 |
| Wind first, let go only to neutral | 2.34 |
| Half the wind both ways | 2.34 |
| Wound and held, never let go | 0.00 |
| Let go 2 ticks later / earlier | 4.97 / 4.11 |

A plain hand-set recipe (Loop, 6 m/s, carriage 0, lean frac 0.9, +1 to -1, ending at blade-off) shows the same thing. Release time against gain, with the twist term alongside:

| Release time | Gain | Twist term |
|---|---|---|
| 0.5 s | 1.39 | 1.38 |
| 0.3 s | 2.67 | 2.64 |
| 0.2 s | 3.91 | 3.87 |
| 0.1 s | 5.34 | 5.28 |

Faster is better while the edge holds. At lean frac 0.7 the 0.1 s release pivots the feet (`yawDev` -4.28), and at 0.5 it loses L in Experimental (gain -4.82).

## Best pairs: the rescue effect (wound held, unwound pivoted)

| Setup, jump | Carriage | L unwound | L wound | Gain | Twist term | Arms term | Unwound `yawDev` | Extra ice | Jitter min/med/max (no TO) |
|---|---|---|---|---|---|---|---|---|---|
| Experimental T | 0.95 | 0.00 | 29.24 | **29.24** | -0.29 | 25.50 | -7.54 | 19.76 | 4.74/28.94/30.10 (10) |
| Simulation F | 0.81 | 0.00 | 28.74 | 28.74 | -0.14 | 24.00 | -9.31 | 18.73 | 8.93/28.37/29.35 (21) |
| Experimental S | 0.99 | 0.00 | 25.39 | 25.39 | -0.25 | 17.00 | -7.89 | 13.24 | 5.02/24.98/26.07 (15) |
| Simulation S | 0.53 | 0.00 | 21.39 | 21.39 | 3.87 | 9.50 | -12.15 | 9.65 | -1.69/21.07/22.56 (0) |
| Simulation T | 1.00 | 0.95 | 21.45 | 20.50 | -1.46 | | | 10.67 | -3.36/20.43/23.43 (0) |

These are cliffs, not slopes. The medians are high, but the worst jitter loses most of the gain, and a sixth to a third of the jitters have no takeoff in the top three rows. Halving the release time gave no takeoff in all four cases where I tried it (the first four rows).

What the trace shows (a Simulation Lo case, carriage 0.75, lean frac 0.9):

1. As the knee starts down, the blades' pivot capacity dips, from about 48 to about 30 N m.
2. If the torque asked of the ice passes that, the feet start to pivot.
3. They do not recover. The ice's share falls to about 5 N m (about 15 by takeoff) and the torque needed to stop them keeps growing, reaching 338 N m at takeoff in the unwound run.
4. From then on the arm swing mostly turns the feet the other way, so the lower-body term cancels the arms.

The wound run also pivoted in that trace. Its swing had already drawn more from the ice before the latch. In the table above, the wound runs avoid the latch altogether.

**Is the wind needed for this?** Not always. Taking the wind-against part out leaves the gain intact in two of the top three (Simulation F 28.77, Experimental S 25.39), so a swing the jump's way is enough there. Letting go only to neutral loses it in all of the top three.

### Against unwound takeoffs climbed just as hard

The first comparison flattered the wind, so I ran the same climb and the same worst-of-jitter score with `windup` zero and feet held, on the same speed and lean. Scores are worst of six jittered runs.

| Objective, setup, jump | Wound L | Unwound L | Wound minus unwound |
|---|---|---|---|
| Rescue, Experimental T | 29.06 | 29.38 | -0.33 |
| Most L, Experimental A | 32.26 | 30.91 | +1.35 |
| Most L, Simulation F | 30.37 | 29.25 | +1.11 |
| Most L, Explorer Lz | 21.40 | 21.26 | +0.14 |
| Most L, Experimental S | 27.62 | 32.32 | -4.69 |
| Rescue, Simulation T | 20.50 | 30.74 | -10.24 |
| Most L, Simulation T | 19.35 | 29.72 | -10.37 |
| Rescue, Simulation S | 21.26 | 32.27 | -11.00 |
| Most L, Simulation Lo | 19.81 | 12.01 | +7.80 (see below) |

- **Simulation Lo +7.80 is probably not real.** The unwound climb sat at carriage 0.02 and never found the arm swing that reached about 30 on the other edges. Treat it as a weak search, not a win.
- **Eight other edges gave no verdict.** The unwound climb never found a start that held under jitter. Those were Rescue on Experimental A, Experimental S, Explorer Lz and Simulation F, and Most L on Experimental Lo, Experimental Lz, Experimental T and Explorer S. On Experimental T, Most L (v 3.36, lean 0.357) failed, while the very close Rescue edge (v 3.32, lean 0.366) reached 29.38. So this is search failure, not proof that the wind is required.

Above the carve, the arms term in held takeoffs tracks 60 N m × load time (25.5 at 0.425 s, 28 at 0.47 s). That is why these runs top out in the same range with or without a wind.

## Through the pad (Experimental, right back outside, no toe)

This uses `setupInput` and the real mapping: B winds, X swings the jump's way, RT loads. It covered 5,040 wound runs, 4,231 with takeoffs in all three comparison runs. Only the loop's entry was swept.

| Speed, stick, heel, load | B window, then X (s before release) | L wound | L same X, no B | L neither | Twist / arms / `yawDev` | Jitter gain vs same X (no TO) |
|---|---|---|---|---|---|---|
| 5, 1.0, 0, 0.45 | 0.30 to 0.20, X 0.20 | 14.86 | 0.00 | 2.40 | 0.30 / 6.95 / 0.00 | 9.52/14.39/15.85 (0) |
| 8, 0.5, heel +1, 0.35 | 0.40 to 0.30, X 0.30 | 16.64 | 1.35 | **29.80** | 3.96 / 12.95 / 0.32 | 0.00/13.51/18.91 (0) |

Both are the rescue effect, not the twist effect. In the second, doing nothing with the arms beats the wound run by 13. I did not trace the source of that 29.80 on the heel-down entry. The two rows of the pad search with the largest gain against "same X" (21.69 and 21.06) have the feet pivoting at takeoff, so they do not answer this question.

The first row's landing was not checked. Two other pad cases, including the second row, landed about one turn but were not standing 1 s after touchdown. Landing physics is under separate research.

## Exact recipe for the best cases

**Highest gain, +5.34 (Experimental Lo, also the same in Simulation):**

```
cd tools/ice-lab
node test/grip-search.ts trace '{"base":{"setup":"experimental","kind":2,"speed":6,"leanFrac":0.9,"entryKnee":0.55,"kneeLoad":0.9,"loadS":0.3,"carriage":0,"pitch":0},"wind":{"w0":1,"tStart":1.3,"tRamp":0.5,"tRel":0.1,"dRel":0.1,"w1":-1}}'
```

**Steadiest high gain and a landing that improves, +4.70 (Experimental T):**

```
cd tools/ice-lab
node test/grip-search.ts trace '{"base":{"setup":"experimental","kind":0,"speed":6.021233661561496,"leanFrac":0.8906134557880684,"entryKnee":0.32243031822452545,"kneeLoad":0.7988802022028358,"loadS":0.40730697283668815,"carriage":0,"pitch":-0.04833463847282345},"wind":{"w0":1,"tStart":1.3510619976411644,"tRamp":0.28746273271598116,"tRel":0.1419447018498869,"dRel":0.13931568405818,"w1":-1}}'
```

In plain terms, direct `SkatingInput` into `step`, 120 Hz, `createState(p, -6.02)`:

- **Edge:** `weight` 1, `lean` -0.89, `pitch` -0.05, `carriage` 0, 1.8 s from start to blade-off.
- **Knee:** 0.32, then 0.80 for the last 0.41 s, then 0.2 on the release tick. `toe` true for the last 0.04 s.
- **Wind** (clockwise-positive `windup`, smoothstepped): up to +1 over 0.29 s starting 1.35 s before blade-off, held, then +1 to -1 over the last 0.14 s.

The script is `tools/ice-lab/test/grip-search.ts`:

```
node test/grip-search.ts coarse 240 coarse.json
node test/grip-search.ts refine coarse.json 300 refined.json
node test/grip-search.ts report refined.json
node test/grip-search.ts fair refined.json 150
node test/grip-search.ts pad
node test/grip-search.ts map
node test/grip-search.ts prior
```

Seeds are fixed, but the coarse, refine and fair stages run for a set number of seconds, so a rerun on a different load explores a different number of cases and can end somewhere else. The exact-case commands (`trace`, `padcheck`) are deterministic.

## What was searched

- **Setups:** Experimental, Simulation, Explorer, from `setupParams`, with no parameter changes.
- **Jumps:** T, S, Lo, F, Lz backward, A forward.
- **Coarse:** 183,733 random pairs in 240 s. 67,560 had no takeoff in one of the two runs. 22,795 gained more than 1, and 3,186 of those had the feet held for the last 0.1 s.
- **Ranges:** speed 3 to 9 m/s, lean frac 0.15 to 0.9, entry knee 0.35 to 0.55, load knee 0.75 to 1, load 0.15 to 0.45 s, carriage 0 to 1, pitch -0.8 to 0.8.
- **Wind:** against then let go (to neutral or past it), wound and held, swing only, and the wrong sign.
- **Climb:** 300 s across 18 setup-jump groups and three objectives (both held, wound held, most L while held), scored by worst of 6 jittered runs, with slightly wider ranges.
- **Measured at takeoff:** L, each `bodyRate` term, regime and `latSlipAccel` from the tick before blade-off (the takeoff clears them), pivot and skid counts, the ice's torque integrated from `torqueBudget`, height, quality. Landings for the top four of each objective.

## What was not searched

- Free leg swing (it rested). It is a separate source of L in Experimental, and interaction with the wind is unknown.
- Carriage changing during a direct-input wound run. Constant by design (see the carriage artefact below); eased only in the unwound grid.
- Toe-out (`toeOut`), two-foot takeoffs, pumps or strokes in the entry.
- Entries from a turn or a dig on purpose (`spinCarry`), and `leanSplit` or `pitchSplit`.
- Worn ice: runs had no ice grid. Stamina starts fresh on each run.
- Dig Gate and Full Repertoire.
- Left-foot takeoffs and toe picks through the pad. The pad sweep covers only the right-foot loop entry.
- Forward takeoffs other than the axel's edge, which the sim names no jump for.

This was a sampled search with a climb, not an exhaustive one, so a higher gain could exist.

## Caveats

- **The pad couples arms and wind.** In Experimental, `windup` = 0.7 × arms and `carriage` = |arms|, eased at 3/s. In Simulation and Explorer, `carriage` = stick magnitude, which is at least |`windup`|. So carriage near 0 with a full wind is not reachable on the pad. The keyboard `,` gives `windup` +1 at carriage 0, but only that one value. The pure-twist table is direct input, so **it shows what the physics allows, not what a player can do today.**
- **A large L that is not grip: carriage on the release tick.** `bodyRate` reads upper inertia from that tick's carriage. Stepping carriage from 0 to 1 on the release tick of the best case reads **L 40.18 instead of 13.48**, with nothing from the ice to pay for it. This is an artefact, excluded from every table by holding carriage constant. I did not test whether a pad can do this: Experimental eases arms, but the Simulation and Explorer stick may be able to. It needs the owner's attention. I changed nothing.
- **A large L that is not grip: carve.** On a shallow edge (lean frac 0.3, carriage 0, 0.3 s release) gain is 8.38 but ice only 2.20. The carve term rises 2.80 to 8.84 with 32 pivot ticks in the load. The docs already note the carve is not charged to the ice, so this is not evidence for the question.
- **A large L that is not grip: skids.** The top raw pair overall (Experimental Lz, 0.00 to 39.72) has the blade skidding with `yawDev` +9.69. The feet are not held, so I excluded it. I did not trace the source. Other large L values come from pitch-heavy skidded entries and are worth a separate look.
- **`bodyRate` counts the shoulders' rate at blade-off, then the body is one rigid spin in the air.** The twist left over at takeoff has no further effect. A real body might differ.
- **The constants deciding this are authored:** `twistTorqueMax` 60, `twistMax` 0.8, `twistStiffness`, `twistDamping`, `lowerBodyInertia`, `armsWhipTorque`, and the hockey-transferred grip (`docs/open-constants.md`). A different ceiling changes the numbers directly.
- **The earlier 3.28.** My attempt at the fixed recipe (`prior` mode) gave at most +0.56 across all three setups, with `twistRate` near 0 at takeoff rather than the +5 reported. So it did not match the earlier sweep's conditions exactly and does not settle that case. Held wind at 0.5 gave L 0.00 from every onset tick tried in Experimental, which fits "a held wind pays nothing". I would still treat 3.28 as unexplained, not disproved.
- **No validation.** Nothing here has been compared with measured skaters or played on a pad.
- **Sim source is unchanged.** Only this file and the script were added.
