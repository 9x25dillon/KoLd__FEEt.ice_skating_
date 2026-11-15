# Element telemetry

**A broadcast card for every element, read from the physics.** 2026-11-14.

When a jump lands, or a spin, turn, twizzle, spiral or Ina Bauer ends, a card slides in from the
right for eight seconds, like a TV jump graphic. **Display only**: a card never feeds a score, a GOE,
the career or an unlock. The owner decides gate policy.

- Recorder and style table: `tools/ice-lab/game/elementstats.ts` (`ElementRecorder`, `STYLE_RULES`).
- Tests: `tools/ice-lab/test/elementstats.test.ts` (they drive the real solver and check each number against the state).
- Bridge: `IceEngine.tick` feeds the recorder after every `step`; each snapshot carries
  `elementCard` (the latest card or null) and `elementCards` (the last eight).
- Godot: `scripts/broadcast.gd` `draw_element_card`. Unreal: `IceRunHUD.cpp` `ElementCard`.
- Stills: `docs/presentation/telemetry/` (Godot `--capture --capture-telemetry`; Unreal
  `-IceProgram=glide,spin,jump,pose -IceShots=22 -IceShotDir=<dir>` with `-game -RenderOffscreen`).

Pure and deterministic: the recorder keeps only what it has seen, so the same replay gives the same cards.

## Measured vs authored

Every number in `stats` and `rows` is read from `SkaterState`, the `landed` and `moveDone` results,
or the support signal. Nothing is estimated. **The style words are the one authored thing**; see the
table at the end.

## A jump (kind `jump`)

From the first air tick (takeoff) to the tick the solver writes `landed` (touchdown). Rates are
sampled every tick, 1/120 s.

| Field | Meaning and how it is read |
|---|---|
| `revolutions`, `turned`, `shortBy` | the sim's own `landed`: called name-number, revolutions turned, revolutions short (negative is over-rotated) |
| name | "TRIPLE FLIP" from `revolutions` and `kind`; "HOP" when the sim called no jump |
| call | the sim's own result: `FALL`, `STEP OUT`, `TWO-FOOT`, else `CLEAN`; the rotation mark (`q`, `<`, `<<`) and edge mark (`!`, `e`) follow |
| `takeoffEdge` | `codeToString(jump.takeoffCode)`, e.g. `LFO` |
| `landingEdge` | the Landing event's `newCode` |
| `entrySpeed` | m/s, speed on the tick before the blade left the ice |
| `takeoffVz` | m/s, `jump.vz` on the first air tick |
| `height` | m, the largest `jump.z` seen in flight |
| `airTime` | s, air ticks times dt |
| `distance` | m, ground distance from where the blade left the ice to the touchdown position |
| `peakRate`, `meanRate` | rev/s; peak of `\|angMomentum / inertia\|` per tick over 2 pi; mean is `turned / airTime` |
| `peakAt` | 0..1, when in the flight the rotation rate peaked (tick of the peak over air ticks) |
| `inertiaRatio` | least `jump.inertia` in flight over the inertia at takeoff (1 = never pulled in). The card shows `1 - ratio` as "pulled in" |
| `exitSpeed`, `speedKept` | m/s speed on the touchdown tick (after the landing scrub), and 100 times exit over entry |
| `loadSeconds`, `loadOneFootSeconds`, `loadDoubleSeconds` | the jump's load phase, and how much of it the support signal read `one` and `both`/`shift` |
| `takeoffQuality`, `landingQuality`, `fall`, `stepOut` | the sim's `landed` result |

## A move (kinds `spin`, `turn`, `twizzle`, `spiral`, `inaBauer`)

From the tick the move starts to the tick `moveDone` is written for it (a move cut short by a fall
writes no card). Common to all: `seconds` (the sim's), `entrySpeed` (speed before the move began),
`exitSpeed`, `speedKept`, `speedLost` (the sim's `moveDone.speedLost`), `fromEdge` / `toEdge`,
`doubleSupportSeconds` (ticks the support signal read `both` or `shift`, times dt).

| Kind | Extra fields |
|---|---|
| spin | `revolutions`, `meanRate` (revs over seconds), `peakRate` (largest `\|spin.omega\|`), `positions` held two revolutions or more, `bestSegRevs`, `travel` (m the centre drifted: the centering) |
| turn | `depth` of the support blade's edge on the exit, `turnKind` (TURN_KIND) |
| twizzle | `revolutions`, `depth` |
| spiral | `peakRaise`, `aboveHip` (s with the free leg at or above the hip) when the setup measures the raise |
| inaBauer | `seconds` held |

## The style line (authored)

**Every threshold below is authored: chosen by eye against a few of the sim's own jumps, not
measured and not from `data/`.** They live in one table, `STYLE_RULES` in `game/elementstats.ts`.
A word shows when its stat satisfies the rule. Tune them there; nothing else reads them.

| Kind | Stat | Rule | Word |
|---|---|---|---|
| jump | height (m) | >= 0.45 | BIG AIR |
| jump | height (m) | <= 0.20 | LOW FLIGHT |
| jump | peakRate (rev/s) | >= 3.0 | FAST ROTATION |
| jump | peakAt | >= 0.60 | DELAYED ROTATION |
| jump | peakAt | <= 0.25 | EARLY ROTATION |
| jump | inertiaRatio | <= 0.40 | TIGHT TUCK |
| jump | speedKept (%) | >= 85 | FLOWING EXIT |
| jump | speedKept (%) | <= 50 | SCRUBBED LANDING |
| jump | distance (m) | >= 3.5 | LONG JUMP |
| spin | meanRate (rev/s) | >= 4.0 | FAST SPIN |
| spin | travel (m) | <= 0.25 | CENTRED |
| spin | travel (m) | >= 1.0 | TRAVELLING |
| spin | revolutions | >= 8 | LONG SPIN |
| turn | speedKept (%) | >= 90 | FLOWING |
| twizzle | speedKept (%) | >= 80 | FLOWING |
| spiral | seconds | >= 3.0 | LONG HOLD |
| spiral | aboveHip (s) | >= 1.5 | ABOVE THE HIP |
| inaBauer | seconds | >= 2.5 | LONG HOLD |

## Known limits

- The computer's showcase jump is a hop, not a triple, so the stills show a hop's card. The test's
  scripted toe loop lands a 3.04-revolution jump (peak 6.9 rev/s, 76 % pulled in, 95 % kept).
- A jump or move ended by a fall: the jump still gets its card (call `FALL`); a move gets none.
- The recorder is fed by live `tick`, not by a replay being played back (`replay` mode shows no cards).
- A jump's mean rate is the sim's `landed.turned` over the measured air time; the revolutions the takeoff edge turned on the ice are not in it.
