# Beat crossovers vs the jump load — does the jump depend on the music?

> **Status, 2026-11-20 (owner):** the lever stays **0** (choice 1). The jump stays
> music-dependent for now. Commit `71ffbe8` ("a 2Lo entrance for
> beatCrossoverHoldSuppress … (WIP)") is **unfinished research**, kept on main
> on purpose. Its `HOLD_SUPPRESS_ENTRANCE` stands at 0/57 with the lever off and
> 3/57 with it on, and its grid search was not re-run, so "nearest of N clean
> doubles" is unconfirmed. Its steps 4–5 (a section here and a pinned test)
> are not done. Nothing in the game reads it. Don't treat its numbers as a result.

**Measurement report, 2026-11-18.** Hand_off.md open question 2. Branch
`beatcross`, baseline `4aaf328`. Data: [`beatcross-2026-11.json`](beatcross-2026-11.json);
bench: `tools/ice-lab/bench/beatcross.ts`; pins: `tools/ice-lab/test/beatcross.test.ts`.
This report measures; it does not change the shipped behaviour. The one new lever
(`beatCrossoverHoldSuppress`) defaults to 0 and is proved inert below.

## Question

In Experimental, automatic beat crossovers each put the weight on both feet; with
`weightTransferMode` 1 the return to one foot takes up to `weightTransferTime`
(0.25 s, **authored**). So a jump load that begins just after a beat starts on two
feet, and whether a jump stands can depend on the music. Proposed option (owner
decides): no automatic crossover while the standing trigger is held toward a load.

## Method

The canonical clean double loop entrance — `jpse/baseline.ts` `BASELINE`, from
`test/backjump.test.ts` (measured 2026-11-14): backward at 7 m/s on a deep back
outside edge, RT half to hold the knee, RT full for 0.425 s with B wound then X
swung, B checked 0.45 s into the air, 1.2 s run-out. The bench shifts the load's
start (`loadAt`) across **one full beat period in 1-tick steps**: 57 offsets,
`loadAt` 1.5000–1.9667 s. One beat at the default 128 bpm (**authored**) is
60/128 = 0.46875 s = 56.25 ticks; 57 one-tick offsets tile it.

Each offset runs the pad script closed-loop through the game's own mapping
(`game/setups.ts setupInput`), so the crossovers react to the shift as a player's
would, on the game's own ice sheet (`iceGridMode` 1). Every run is replay-verified
into a fresh sheet (`sim/replay.ts`) and carries its final digest; all 114 verify.
Per offset the bench records the takeoff (right) foot's share of the support signal
(`sim/support.ts`) at the load's first tick and on the last grounded tick before
blade-off, the automatic crossover starts, takeoff angular momentum L, the
landing's call, airborne degrees (`landed.turned × 360`; `rotationCallMode` 0 counts
the air alone) and the run-out. The sweep is deterministic: the same offset twice
is the same run, digest and all (pinned).

The lever, prototyped behind `beatCrossoverHoldSuppress` (0 by default, 0/1
validated, mapping-only — the solver never reads it): at 1, on one foot, not
mid-push, the standing trigger pulled past the snap window (`GESTURE_TICKS` 30, so
a pump is not a hold) joins the existing "jump loading" guard
(`game/full-controls.ts`) that stops automatic crossovers. At 0 the guard is
exactly the shipped one.

## Mechanism

`autoCrossover` (`game/full-controls.ts`) fires on the single tick each beat where
the skater is backward at ≥ 1.5 m/s on a lean ≥ `crossoverLean` (0.21), in no move
or jump: it asks `push: true, weight: 0.5` and holds both blades down for
`strokeDuration` (0.30 s, **authored**). The solver's `transferLoad` then moves the
share as a critically damped response over `weightTransferTime`. The shipped guard
already stops crossovers once the standing knee reaches `jumpLoadKnee` (0.7) or the
Load phase starts — but the entrance's glide carry is RT half (knee ≈ 0.474, below
0.7), so crossovers run right up to the load. In this entrance they fire at ticks
113 and 169 (the beat at 57 is too shallow); the load at tick 180+k begins 11+k
ticks after the 169 crossover, while the share is still returning to one foot.

## Sweep 1 — `beatCrossoverHoldSuppress` 0 (the shipped behaviour)

| k | loadAt (s) | beat phase | share@load | share@off | crossovers (ticks) | L | air° | call | stood | outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 1.5000 | 0.218 | 0.621 | 1.000 | 113, 169, 338, 394 | 24.18 | 713.4 | clean | 144 | clean |
| 1 | 1.5083 | 0.236 | 0.608 | 1.000 | 113, 169 | 17.61 | 519.3 | downgraded | 0 | fall |
| 2 | 1.5167 | 0.253 | 0.596 | 1.000 | 113, 169 | 19.95 | 588.3 | under | 0 | fall |
| 3 | 1.5250 | 0.271 | 0.586 | 1.000 | 113, 169, 338, 394 | 23.94 | 705.9 | clean | 144 | clean |
| 4 | 1.5333 | 0.307 | 0.571 | 1.000 | 113, 169, 338, 394 | 24.08 | 710.0 | clean | 144 | clean |
| 5 | 1.5417 | 0.307 | 0.571 | 1.000 | 113, 169, 338, 394 | 24.61 | 725.5 | clean | 144 | clean |
| 6 | 1.5500 | 0.324 | 0.565 | 1.000 | 113, 169, 338, 394 | 24.50 | 722.3 | clean | 144 | clean |
| 7 | 1.5583 | 0.342 | 0.560 | 1.000 | 113, 169, 338, 394 | 24.15 | 711.9 | clean | 144 | clean |
| 8 | 1.5667 | 0.360 | 0.555 | 1.000 | 113, 169, 338, 394 | 25.10 | 739.8 | clean | 144 | clean |
| 9 | 1.5750 | 0.378 | 0.551 | 1.000 | 113, 169, 338, 394 | 24.88 | 719.9 | clean | 144 | clean |
| 10 | 1.5833 | 0.396 | 0.548 | 1.000 | 113, 169, 338, 394 | 25.12 | 726.8 | clean | 144 | clean |
| 11 | 1.5917 | 0.413 | 0.546 | 1.000 | 113, 169, 338, 394 | 25.19 | 728.5 | clean | 144 | clean |
| 12 | 1.6000 | 0.431 | 0.543 | 1.000 | 113, 169, 338, 394 | 24.35 | 704.3 | clean | 144 | clean |
| 13 | 1.6083 | 0.449 | 0.541 | 1.000 | 113, 169, 338 | 24.33 | 703.7 | clean | 71 | fall |
| 14 | 1.6167 | 0.467 | 0.540 | 1.000 | 113, 169, 338, 394 | 24.40 | 705.5 | clean | 144 | clean |
| 15 | 1.6250 | 0.484 | 0.538 | 1.000 | 113, 169, 338 | 24.34 | 703.7 | clean | 67 | fall |
| 16 | 1.6333 | 0.502 | 0.537 | 1.000 | 113, 169, 338, 394 | 25.25 | 729.8 | clean | 144 | clean |
| 17 | 1.6417 | 0.520 | 0.536 | 1.000 | 113, 169, 338, 394 | 25.22 | 728.7 | clean | 144 | clean |
| 18 | 1.6500 | 0.538 | 0.535 | 1.000 | 113, 169, 338 | 25.26 | 743.5 | clean | 69 | fall |
| 19 | 1.6583 | 0.556 | 0.531 | 1.000 | 113, 169, 338, 394, 450, 451 | 25.30 | 744.3 | clean | 144 | clean |
| 20 | 1.6667 | 0.573 | 0.531 | — | 113, 169 | — | — | none | — | fell-entry |
| 21 | 1.6750 | 0.591 | 0.531 | — | 113, 169 | — | — | none | — | fell-entry |
| 22 | 1.6833 | 0.609 | 0.531 | — | 113, 169 | — | — | none | — | fell-entry |
| 23 | 1.6917 | 0.627 | 0.531 | 1.000 | 113, 169, 338 | 25.33 | 744.9 | clean | 57 | fall |
| 24 | 1.7000 | 0.644 | 0.531 | 1.000 | 113, 169, 338, 394, 450, 451 | 25.33 | 731.3 | clean | 144 | clean |
| 25 | 1.7083 | 0.662 | 0.531 | 1.000 | 113, 169, 338, 394 | 25.09 | 724.6 | clean | 144 | clean |
| 26 | 1.7167 | 0.698 | 0.623 | 1.000 | 113, 169, 338, 394 | 24.16 | 704.6 | clean | 144 | clean |
| 27 | 1.7250 | 0.716 | 0.671 | 1.000 | 113, 169, 338, 394 | 24.33 | 709.6 | clean | 144 | clean |
| 28 | 1.7333 | 0.716 | 0.671 | 1.000 | 113, 169, 338, 394 | 24.38 | 704.0 | clean | 144 | clean |
| 29 | 1.7417 | 0.733 | 0.715 | 1.000 | 113, 169, 338, 394 | 24.46 | 706.1 | clean | 95 | fall |
| 30 | 1.7500 | 0.751 | 0.755 | 1.000 | 113, 169, 338 | 24.45 | 705.9 | clean | 63 | fall |
| 31 | 1.7583 | 0.769 | 0.790 | 1.000 | 113, 169, 338, 394 | 25.31 | 730.6 | clean | 68 | fall |
| 32 | 1.7667 | 0.787 | 0.821 | 1.000 | 113, 169, 338 | 25.30 | 730.2 | clean | 39 | fall |
| 33 | 1.7750 | 0.804 | 0.847 | — | 113, 169 | — | — | none | — | fell-entry |
| 34 | 1.7833 | 0.822 | 0.870 | — | 113, 169 | — | — | none | — | fell-entry |
| 35 | 1.7917 | 0.840 | 0.889 | — | 113, 169 | — | — | none | — | fell-entry |
| 36 | 1.8000 | 0.858 | 0.906 | — | 113, 169 | — | — | none | — | fell-entry |
| 37 | 1.8083 | 0.876 | 0.920 | — | 113, 169 | — | — | none | — | fell-entry |
| 38 | 1.8167 | 0.893 | 0.932 | — | 113, 169 | — | — | none | — | fell-entry |
| 39 | 1.8250 | 0.911 | 0.942 | — | 113, 169 | — | — | none | — | fell-entry |
| 40 | 1.8333 | 0.929 | 0.951 | — | 113, 169 | — | — | none | — | fell-entry |
| 41 | 1.8417 | 0.964 | 0.965 | — | 113, 169 | — | — | none | — | fell-entry |
| 42 | 1.8500 | 0.982 | 0.970 | — | 113, 169 | — | — | none | — | fell-entry |
| 43 | 1.8583 | 0.982 | 0.970 | — | 113, 169 | — | — | none | — | fell-entry |
| 44 | 1.8667 | 0.000 | 0.975 | — | 113, 169 | — | — | none | — | fell-entry |
| 45 | 1.8750 | 0.018 | 0.978 | — | 113, 169 | — | — | none | — | fell-entry |
| 46 | 1.8833 | 0.036 | 0.937 | — | 113, 169, 225 | — | — | none | — | fell-entry |
| 47 | 1.8917 | 0.053 | 0.892 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 48 | 1.9000 | 0.071 | 0.847 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 49 | 1.9083 | 0.089 | 0.804 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 50 | 1.9167 | 0.107 | 0.766 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 51 | 1.9250 | 0.124 | 0.733 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 52 | 1.9333 | 0.142 | 0.703 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 53 | 1.9417 | 0.160 | 0.678 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 54 | 1.9500 | 0.178 | 0.656 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 55 | 1.9583 | 0.196 | 0.637 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |
| 56 | 1.9667 | 0.231 | 0.608 | — | 113, 169, 225, 226 | — | — | none | — | fell-entry |

**Findings (off).** Only **20 of 57** offsets complete the clean 2Lo and stand the
run-out. The load's start share sweeps **0.531–0.978**: loads just after the beat
at 169 (offsets 0–24) begin two-footed (0.53–0.65), confirming the question's
premise; by blade-off the share is 1.000 on every run that took off (the 0.425 s
load outlasts the 0.25 s transfer). The music matters through two fall paths, both
`LEAN EXCEEDED` (35 of 37 falls; the other 2 are `LANDING`, offsets 1–2, called
under/downgraded):

- **Entry falls (27 offsets: 20–22 and 33–56).** The load never reaches release.
  The held full-lean carve keeps deepening; a load started later in it (offsets
  33+, share already 0.85+) leans past the limit before the 0.425 s window ends
  (probed offset 36: lean −0.88 at the load, −1.13 at the fall, tick 261, release
  due 267). Offsets 20–22 fall the same way but catch a diverging phase of the
  balance oscillation the crossover pushes left (probed offset 21: balance error
  −1.54 mid-load, never recovers).
- **Run-out falls (8 offsets: 13, 15, 18, 23, 29–32).** The jump is called clean
  but the skater falls in the 1.2 s run-out, where the beat crossovers continue
  (ticks 338, 394, 450…) and put the weight on both feet under the landing glide.

Takeoff L varies 24.1–25.3 across the standing offsets — the entry the crossovers
shape is not one entrance but a family, and the load phase picks which member.

## Sweep 2 — `beatCrossoverHoldSuppress` 1 (the owner's option)

| k | loadAt (s) | beat phase | share@load | share@off | crossovers (ticks) | L | air° | call | stood | outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 1.5000 | 0.218 | 1.000 | — | — | — | — | none | — | fell-entry |
| 1 | 1.5083 | 0.236 | 1.000 | — | — | — | — | none | — | fell-entry |
| 2 | 1.5167 | 0.253 | 1.000 | — | — | — | — | none | — | fell-entry |
| 3 | 1.5250 | 0.271 | 1.000 | — | — | — | — | none | — | fell-entry |
| 4 | 1.5333 | 0.307 | 1.000 | — | — | — | — | none | — | fell-entry |
| 5 | 1.5417 | 0.307 | 1.000 | — | — | — | — | none | — | fell-entry |
| 6 | 1.5500 | 0.324 | 1.000 | — | — | — | — | none | — | fell-entry |
| 7 | 1.5583 | 0.342 | 1.000 | — | — | — | — | none | — | fell-entry |
| 8 | 1.5667 | 0.360 | 1.000 | — | — | — | — | none | — | fell-entry |
| 9 | 1.5750 | 0.378 | 1.000 | — | — | — | — | none | — | fell-entry |
| 10 | 1.5833 | 0.396 | 1.000 | — | — | — | — | none | — | fell-entry |
| 11 | 1.5917 | 0.413 | 1.000 | — | — | — | — | none | — | fell-entry |
| 12 | 1.6000 | 0.431 | 1.000 | — | — | — | — | none | — | fell-entry |
| 13 | 1.6083 | 0.449 | 1.000 | — | — | — | — | none | — | fell-entry |
| 14 | 1.6167 | 0.467 | 1.000 | — | — | — | — | none | — | fell-entry |
| 15 | 1.6250 | 0.484 | 1.000 | — | — | — | — | none | — | fell-entry |
| 16 | 1.6333 | 0.502 | 1.000 | — | — | — | — | none | — | fell-entry |
| 17 | 1.6417 | 0.520 | 1.000 | — | — | — | — | none | — | fell-entry |
| 18 | 1.6500 | 0.538 | 1.000 | — | — | — | — | none | — | fell-entry |
| 19 | 1.6583 | 0.556 | 1.000 | — | — | — | — | none | — | fell-entry |
| 20 | 1.6667 | 0.573 | 1.000 | — | — | — | — | none | — | fell-entry |
| 21 | 1.6750 | 0.591 | 1.000 | — | — | — | — | none | — | fell-entry |
| 22 | 1.6833 | 0.609 | 1.000 | — | — | — | — | none | — | fell-entry |
| 23 | 1.6917 | 0.627 | 1.000 | — | — | — | — | none | — | fell-entry |
| 24 | 1.7000 | 0.644 | 1.000 | — | — | — | — | none | — | fell-entry |
| 25 | 1.7083 | 0.662 | 1.000 | — | — | — | — | none | — | fell-entry |
| 26 | 1.7167 | 0.698 | 1.000 | — | — | — | — | none | — | fell-entry |
| 27 | 1.7250 | 0.716 | 1.000 | — | — | — | — | none | — | fell-entry |
| 28 | 1.7333 | 0.716 | 1.000 | — | — | — | — | none | — | fell-entry |
| 29 | 1.7417 | 0.733 | 1.000 | — | — | — | — | none | — | fell-entry |
| 30 | 1.7500 | 0.751 | 1.000 | — | — | — | — | none | — | fell-entry |
| 31 | 1.7583 | 0.769 | 1.000 | — | — | — | — | none | — | fell-entry |
| 32 | 1.7667 | 0.787 | 1.000 | — | — | — | — | none | — | fell-entry |
| 33 | 1.7750 | 0.804 | 1.000 | — | — | — | — | none | — | fell-entry |
| 34 | 1.7833 | 0.822 | 1.000 | — | — | — | — | none | — | fell-entry |
| 35 | 1.7917 | 0.840 | 1.000 | — | — | — | — | none | — | fell-entry |
| 36 | 1.8000 | 0.858 | 1.000 | — | — | — | — | none | — | fell-entry |
| 37 | 1.8083 | 0.876 | 1.000 | — | — | — | — | none | — | fell-entry |
| 38 | 1.8167 | 0.893 | 1.000 | — | — | — | — | none | — | fell-entry |
| 39 | 1.8250 | 0.911 | 1.000 | — | — | — | — | none | — | fell-entry |
| 40 | 1.8333 | 0.929 | 1.000 | — | — | — | — | none | — | fell-entry |
| 41 | 1.8417 | 0.964 | 1.000 | — | — | — | — | none | — | fell-entry |
| 42 | 1.8500 | 0.982 | 1.000 | — | — | — | — | none | — | fell-entry |
| 43 | 1.8583 | 0.982 | 1.000 | — | — | — | — | none | — | fell-entry |
| 44 | 1.8667 | 0.000 | 1.000 | — | — | — | — | none | — | fell-entry |
| 45 | 1.8750 | 0.018 | 1.000 | — | — | — | — | none | — | fell-entry |
| 46 | 1.8833 | 0.036 | 1.000 | — | — | — | — | none | — | fell-entry |
| 47 | 1.8917 | 0.053 | 1.000 | — | — | — | — | none | — | fell-entry |
| 48 | 1.9000 | 0.071 | 1.000 | — | — | — | — | none | — | fell-entry |
| 49 | 1.9083 | 0.089 | 1.000 | — | — | — | — | none | — | fell-entry |
| 50 | 1.9167 | 0.107 | 1.000 | — | — | — | — | none | — | fell-entry |
| 51 | 1.9250 | 0.124 | 1.000 | — | — | — | — | none | — | fell-entry |
| 52 | 1.9333 | 0.142 | 1.000 | — | — | — | — | none | — | fell-entry |
| 53 | 1.9417 | 0.160 | 1.000 | — | — | — | — | none | — | fell-entry |
| 54 | 1.9500 | 0.178 | 1.000 | — | — | — | — | none | — | fell-entry |
| 55 | 1.9583 | 0.196 | 1.000 | — | — | — | — | none | — | fell-entry |
| 56 | 1.9667 | 0.231 | 1.000 | — | — | — | — | none | — | fell-entry |

**Findings (on).** The option does exactly what it says: **zero** automatic
crossovers across all 57 offsets, and the load begins **one-footed (share 1.000)
at every offset** — the two-footed start is gone. But **0 of 57** stand: every run
falls `LEAN EXCEEDED` in the load itself, before release. The canonical entrance
holds RT half from tick 0, so "the standing trigger held toward a load" is true for
the whole glide; suppression removes the crossover pushes at 113 and 169 that the
entrance rode in on. Without them the glide is shallower and slower (probed offset
0: lean −0.64 vs −0.88, speed 6.56 vs 6.78 m/s at tick 160), and the load's knee
extension drives the lean past the limit with no push to re-shape the curve (lean
−0.69 at the load → −1.16 at the fall, tick 216, release due 231). The option
trades the music dependence for an entrance that no longer lands at all.

## One-line answer

**Yes — on the shipped setup the same clean-2Lo script stands at only 20 of 57 load
phases across one beat, because the beat's crossovers shape the entry and a load
just after a beat begins two-footed; the owner's hold-suppression removes the
two-footed start (share 1.000 at all 57) but also the pushes this entrance depends
on, so it stands at 0 of 57.**

## The owner's choice

1. **Keep the shipped behaviour (lever 0).** The entrance is music-dependent
   (20/57) but works at the phases the canonical script was searched on. No change.
2. **Adopt the option (lever 1) and re-search the entrance.** The option is sound
   for a player who glides with triggers released and only holds to prepare the
   load — released, the beat still crossovers (pinned: the guard is the hold, not
   the crossover). The canonical script is the special case that holds RT half
   throughout, so it loses its propulsion. A new baseline would build speed and
   edge before the hold (strokes, or a released glide then a hold) and be re-searched
   with JPSE; the lever then keeps its load one-footed. This is a new entrance, not
   a fix to the old one.
3. **Refine the option (not prototyped here — measure, don't change behaviour).**
   Narrower readings leave the canonical entrance untouched: suppress only holds at
   or above `PUMP_HIGH` (0.6) — the script's RT half (0.474) would not qualify, and
   the existing load guard already stops crossovers once RT ≥ 0.7 — or suppress only
   the crossover's `weight: 0.5` while keeping its push, or only within a window
   before the load. Each is a different lever; the owner picks the reading. The
   prototype here is the literal one: any hold past the snap window.

**Recommendation to the owner:** the literal option (choice 2's lever) is correct
for the held-prepare posture but breaks the searched canonical script; do not ship
it on by default. Either keep 0 (choice 1) or adopt it together with a re-searched
entrance (choice 2). The lever is inert at 0 and ready for that decision.

## Inertness proof (lever 0)

- Full verify identical to the `4aaf328` baseline: ice-lab **1095 tests, 1094 pass,
  0 fail, 1 todo** (the documented fidelity-floor todo, `discretisation.test.ts:332`);
  `replay/verify.ts` **{"verified":true,"ticks":240}**; Godot prepare 94 modules;
  Godot **68/68**. Replay contract stays **/39**; fixture rebased
  (`replay/rebase-fixture.ts`), `digestsUnchanged: true`, only key added
  `beatCrossoverHoldSuppress: 0`.
- The off sweep measured **before** the lever existed and **after** is byte-identical
  across all 57 records (every field, every digest) — the guard at 0 changes no
  mapped input and no state.
- Typecheck clean (`tsc --noEmit -p .`).

## Limits

- One entrance (the canonical 2Lo), one speed (7 m/s), one bpm (128, authored), one
  setup (Experimental). Other jumps, speeds, tracks or setups may differ; the bench
  takes `BASELINE` and params as given and is easy to re-point.
- "Held toward a load" is prototyped as any standing-trigger hold past the snap
  window on one foot. The threshold is a prototype choice (see choice 3); the
  report's 0/57 is specific to that reading and this script.
- The air degrees count the air alone (`rotationCallMode` 0, the setup's default);
  the takeoff edge's turn is not credited here.
- Closed-loop mapping, open-loop within each run: the script does not correct a
  failing load back toward success (as JPSE intends — it measures what the geometry
  alone does).

## Reproduce

    (cd tools/ice-lab && node bench/beatcross.ts)        # both sweeps, writes the JSON
    (cd tools/ice-lab && node --test test/beatcross.test.ts)
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
