# Why Nationals has no clean pilot run (Hand_off Open question 3), 2026-11-18

Measured on origin/main 4aaf328, Simulation, the rival tool's wide grid (radii 8–16 × jump entries
2.8–3.9 = 45 runs an event), fresh career skater, through the bridge.

## The weight transfer is not the cause
Same grid, `weightTransferMode` forced per run (`tools/transfer_ab.mjs`):

| Event | Transfer | Stamina | Clean | Median |
|---|---|---|---|---|
| Northern Cup | on (as shipped) | on | 7/45 | 31.00 |
| Northern Cup | off | on | 7/45 | 32.04 (= the 11-11 BASELINE 32.0) |
| Nationals | off | on | **0/45** | — |
| Northern Cup | on | **off** | **21/45** | 28.99 |

Nationals was never measured: `game/rivals.ts` already says its 32.0 is BORROWED from the Northern
Cup ("the pilot never lands three half turns clean in one program"). The 2026-11-14 hand-off's
"no clean run in 45" is that same, older limit, not a regression.

## What does cause it: the legs, on a fresh skater
Per takeoff (`tools/takeoff_diag.mjs`, Northern Cup):
- Jump 1: legs 0.94, turned 0.61, always lands.
- Jump 2: legs 0.81–0.82, turned 0.42–0.52; lands only at ≈0.5 or more. With stamina off it turns
  0.49–0.77 and clean runs triple (7 → 21 of 45).
- `jumpImpulse` scales lerp(0.82, 1, legs) (`sim/solver.ts` ~697). Legs drain 0.011 a push and 0.05
  a jump, and recover only 0.0008 /s when gliding (`sim/params.ts` ~1157–1165): ten seconds of
  rest gives back 0.008, so no pacing a pilot could do brings jump 3 back.
- After one fall the pilot retries the jump while still travelling backward (fwd −1 at takeoff),
  each retry costs legs again, and the turn decays 0.6 → 0.22: one fall ends the program.
- Separately, at radii 10–12 the crossover after the first spin falls (LEAN EXCEEDED at 29.4 s),
  a pilot-orbit issue.

## Owner's choices
1. **Keep borrowing** Nationals from the Northern Cup (same 240 s free segment, half turns score no
   TES, so both are PCS). Then the question is only the Northern Cup's number: 31.0 re-measured
   with the transfer on, against 32.0 (7 clean runs either way; within the grid's noise).
2. **Measure season two with the body a player brings to it**: the skater's stats at the career's
   floors for that event, not a fresh skater's. A trained skater's legs are the variable this
   turns on. That changes what BASELINE means, so it's the owner's call.
3. Pilot fixes that are measurement-only either way: turn forward before retrying a jump (as it
   already does after a spin), and a wider orbit for the crossover after a spin.
