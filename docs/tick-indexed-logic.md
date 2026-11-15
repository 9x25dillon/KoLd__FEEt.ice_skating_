# Tick-indexed logic — an inventory

**Where the code counts ticks instead of seconds, and what each occurrence is.** A prerequisite for any
study that runs the model at another step size ([fidelity-gate §5.4](fidelity-gate.md#54--known-limitations-of-the-measurement)).
Changing `dt` and calling the result a convergence study is only valid for runs that touch nothing in
the "physics" rows below.

Read from the code at `281bf8d`, 2026-11-14, with these searches from the repository root (the
generated `games/ice-run-godot/runtime/` is a copy and is left out):

```sh
grep -rnE 'tick ?% ?[0-9]+|[Tt]icks? ?% ?[0-9]+' tools/ice-lab/sim tools/ice-lab/game tools/ice-lab/jpse \
  tools/ice-lab/app tools/ice-lab/validate.mjs games/ice-run-godot/bridge games/ice-run-godot/scripts \
  games/ice-run-unreal/Source
grep -nE 'SIM_DT|SIM_HZ' tools/ice-lab/sim/*.ts
grep -nE 'rng\(|s\.tick ?- |\.tick ?[<>=]' tools/ice-lab/sim/*.ts
```

**Classes.** *Physics*: it changes what the solver computes, so a run at another step is a different
run. *Input timing*: it decides when a command reaches the solver; the solver is unchanged, the run is
not. *Presentation*: it decides what is drawn or sent; the solver's state is the same with or without
it. *Bookkeeping*: counts, limits and labels. *Scaled by dt*: written with ticks, multiplied by `dt`
before use, so it is already in seconds.

## The correction this inventory makes

The 2026-11-15 review and the build brief describe `s.tick % 90` and `s.tick % 4` as tick-indexed
logic in the model. **Neither is in `tools/ice-lab/sim/`.** Both are in the layers that feed and draw
the solver. What is tick-indexed inside `sim/` is the music clock and the stamina noise, below.

## Inside the solver (`tools/ice-lab/sim/`)

| Where | What | Class | At another step |
| --- | --- | --- | --- |
| `music.ts:33`, `music.ts:60` | The beat phase and bar number are `tick * SIM_DT`, with the constant 1/120 s, not the `dt` that `step()` was given | **Physics**, when `musicMode` is on: `onBeat` decides `MusicHit` or `MusicMiss` on a push (`solver.ts:937`), and `accentCredit` feeds hype and flow | The music clock runs at the wrong speed. Needs `tick * dt`, or elapsed time carried in state |
| `solver.ts:986` | Stamina balance noise is `rng(s.tick)`: one draw per tick, seeded by the tick count | **Physics**, when `staminaMode` is on and the noise amplitude is above 0 | A different noise sequence, with a different spectrum: twice the draws per second at 240 Hz |
| `solver.ts:717` and the `pFatigue` / `pEff` chain | Flow, fatigue and hype are read as last tick's value | **Physics**, small: a one-tick lag in a multiplier | The lag halves with the step. Converges, at first order |
| `solver.ts:1506` | The ice sheet is written where each blade ends up, one tick after it is read | **Physics**, when `iceGridMode` is on | The same: a one-tick lag |
| `solver.ts:1037` | Control latency filter, `alpha = min(1, dt / controlLatency)` | Scaled by dt | Converges. The filter is a first-order discretisation of a lag |
| `solver.ts:875`, `jump.ts:273`, `279`, `350`, `418` | Push-off and wind-up timers, `(s.tick − since) * dt` | Scaled by dt | Correct at any step, quantised to it |
| `solver.ts:1685`, `1691` | Time since the last element, and the 0.3 s landing settle, `(s.tick − landed.tick) * dt` | Scaled by dt | Correct at any step |
| `solver.ts:1773` | `run()` steps at `SIM_DT` | Bookkeeping: a convenience for tests and replay | A caller that wants another step calls `step()` itself, as `discretisation.test.ts` does |
| `stepLevel.ts:80`, called from `game/career.ts:348` | Step-sequence events within `windowTicks` of now | **Scoring**, not solver state: which turns count toward a step level | The window is a tick count; it would need to be given in seconds |
| `combo.ts:78`, `sheet.ts:46` | `landed.tick` compared for identity, to score a landing once | Bookkeeping | Unaffected |
| `replay.ts:292`, `412`, `490` | Replays are 120 Hz by contract: `hz` is checked, and the player steps at `SIM_DT` | Bookkeeping: the replay contract | A replay at another step is a different contract (`REPLAY_SOLVER`) |
| `params.ts:1290`–`1347` | `validate()` rejects durations under two or four ticks of `SIM_DT` | Bookkeeping: limits on parameters | The limits would need the step in use |
| `telemetry.ts`, `session.ts` | Time shown as `tick / SIM_HZ`; ratios of tick counts | Presentation, and bookkeeping | Ratios are unaffected; shown times would be wrong |

## Feeding the solver (input timing)

| Where | What | At another step |
| --- | --- | --- |
| `games/ice-run-godot/bridge/engine.mjs:304` | A held push, or cruise below 5.5 m/s, strokes again when `s.tick % 90 === 0`: every 0.75 s | Strokes every 90 ticks of the new step: twice as often at 240 Hz |
| `tools/ice-lab/game/main.ts:550` | The browser game's version of the same rule | The same |
| `tools/ice-lab/game/full-controls.ts:635` | The full control scheme's held push, `s.tick % 90 === 0` | The same |
| `tools/ice-lab/game/pairs.ts:146` | A fallen partner pushes on `s.tick % 90 === 0` once 1.2 s have passed | The same |
| `tools/ice-lab/game/pairs.ts:166` | The partner strokes on `s.tick % 72 === 0`: every 0.6 s | The same |

These matter to a dt study more than their class suggests. A push is an impulse, so a stroke that
lands on a different tick is a different run. Every pinned script that holds a push inherits the
90-tick grid. They also tie the stroke to the **absolute** tick count, not to when the button went
down: the gap between a first push and its first repeat is anywhere from one tick to 0.75 s,
depending on when in the run the button was pressed. That is the kind of dependence the hand-off calls
a knife edge, and it is separate from step-size error.

## Drawing the solver (presentation)

| Where | What |
| --- | --- |
| `games/ice-run-godot/bridge/engine.mjs:321`, `322` | The blade tracing sent to the clients is sampled when `tick % 4 === 0`: 30 points a second, for the skater and the pairs partner |
| `tools/ice-lab/game/main.ts:181`, `game/controller-rig.ts:258` | The browser's tracing, the same 4-tick sampling |
| `games/ice-run-godot/scripts/broadcast.gd:41` | The broadcast camera's rink path, sampled on `tick % 8 < 3` |

None of these is read back by the solver. The ice sheet the solver does read (`sim/ice.ts`) is written
every tick, not every fourth.

## The clients' clock

Both clients owe the solver 120 ticks a second and ask for at most 12 at once, one request in flight
(`main.gd:2017`, `IceRunGameMode.cpp:897`). That is a wall-clock-to-tick conversion with the rate
written in as 120. It is counted and logged since the tick-debt counter was added; see
[`Hand_off.md`](../Hand_off.md).

## What a dt study has to do, by kind of run

| Run | Tick-indexed logic it touches | Can it be re-run at another step by changing `dt`? |
| --- | --- | --- |
| A held edge, a glide, a carve: `musicMode`, `staminaMode` and `iceGridMode` off, no push held | none | **Yes.** This is what `discretisation.test.ts` does |
| A scripted jump from a glide, modes as above | the timers, which scale | **Yes**, with the script given in seconds and re-expanded to ticks at the new rate |
| Anything with a held push | the 90-tick repeat | **No**, until the repeat is a time, or the script names each push |
| Anything with music scoring on | `music.ts` | **No**, until the music clock uses `dt` |
| Anything with stamina noise | `rng(s.tick)` | **No**: the noise is defined per tick. It can be compared in distribution, not tick for tick |
| A recorded replay | the replay contract | **No**: a replay is 120 Hz by definition |

Nothing in this document changes code. Converting any row above from ticks to seconds is a solver or
contract change, with a `REPLAY_SOLVER` bump where it moves a digest.
