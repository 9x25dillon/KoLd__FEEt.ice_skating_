# Boards gap — November 2026

Measured by `tools/ice-lab/bench/boardsgap.ts`. All durations use 120 Hz. Thresholds in the JSON method are authored diagnostic definitions.

The exact rule is `into <= 0` in `game/rink.ts`: an outside standing skater moving inward or tangentially returns before projection. Fallen skaters return even earlier. The prototype projects only the former, without changing velocity or events.

The collision mutates the same state the next solver tick reads. Capturing a digest before collision does **not** isolate future ticks from it. Both recorder and post-collision digest changes are measured.

## Replay and input-fixture measurements

| Source | Off outside ticks | On outside ticks | Off max depth (mm) | On max depth (mm) | Changed recorder ticks | First change |
|---|---:|---:|---:|---:|---:|---:|
| tools/ice-lab/test/fixtures/replay-v1.json | 0 | 0 | 0.000000 | 0.000000 | 0 | — |
| tools/ice-lab/test/fixtures/setup-mapping-v1.json#simulation | 0 | 0 | 0.000000 | 0.000000 | 0 | — |
| tools/ice-lab/test/fixtures/setup-mapping-v1.json#explorer | 0 | 0 | 0.000000 | 0.000000 | 0 | — |
| tools/ice-lab/test/fixtures/setup-mapping-v1.json#experimental | 0 | 0 | 0.000000 | 0.000000 | 0 | — |
| tools/ice-lab/test/fixtures/setup-mapping-v1.json#diggate | 0 | 0 | 0.000000 | 0.000000 | 0 | — |
| tools/ice-lab/test/fixtures/setup-mapping-v1.json#repertoire | 0 | 0 | 0.000000 | 0.000000 | 0 | — |
| owner-first-ice | 552 | 407 | 8761.973943 | 8761.973943 | 7751 | 1250 |

The JSON includes every contiguous outside interval, inbound/outbound/tangent counts, fallen counts, total and longest duration, pre-collision measurements, raw positive-distance counts, input SHA-256 hashes, and digest-stream hashes. Unsupported recordings are not zero-gap results.

## Warm-up reproducer

| Skater | Off ticks | On ticks | Off max depth (mm) | On max depth (mm) | On ticks while fallen | Off seconds | Longest interval (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ansa Merrow | 0 | 0 | 0.000000 | 0.000000 | 0 | 0.000000 | 0.000000 |
| Lio Tarrant | 0 | 0 | 0.000000 | 0.000000 | 0 | 0.000000 | 0.000000 |
| Katya Vell | 97 | 10 | 1.134692 | 1.134692 | 10 | 0.808333 | 0.808333 |
| Noor Ashdown | 0 | 0 | 0.000000 | 0.000000 | 0 | 0.000000 | 0.000000 |
| Remi Castellan | 0 | 0 | 0.000000 | 0.000000 | 0 | 0.000000 | 0.000000 |
| Teodora Wynn | 0 | 0 | 0.000000 | 0.000000 | 0 | 0.000000 | 0.000000 |

This is the existing 45-second warm-up pilot. In the on trial, the extra projection runs after its existing collision call, before the next tick; no controls or tolerances change.

## Corpus coverage

| Source | Status | Reason |
|---|---|---|
| tools/ice-lab/native/reference/replay-v1.json | unsupported-replay | Replay solver version does not match this build |
| tools/ice-lab/test/fixtures/jpse-loop-v1.json | not-a-replay | Geometry/program/measurement fixture; no full replay input stream |
| tools/ice-lab/test/fixtures/jpse/canonical.program.json | not-a-replay | Geometry/program/measurement fixture; no full replay input stream |
| tools/ice-lab/test/fixtures/jpse/geometry-cases.json | not-a-replay | Geometry/program/measurement fixture; no full replay input stream |
| tools/ice-lab/test/fixtures/jpse/transforms.json | not-a-replay | Geometry/program/measurement fixture; no full replay input stream |
| tools/ice-lab/test/fixtures/replay-v1.json | measured | ice-lab-f64/39 |
| tools/ice-lab/test/fixtures/setup-mapping-v1.json | measured-input-fixture | — |
| recordings/2026-09-24-edgework-session.json | summary-only | No per-tick positions or inputs |
| recordings/2026-09-24-edgework-session1.json | summary-only | No per-tick positions or inputs |
| recordings/2026-09-24-edgework-session3.json | summary-only | No per-tick positions or inputs |
| recordings/aedgework-replay.json | unsupported-replay | Replay solver version does not match this build |
| recordings/edgework-replay-4.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay-4768eeb6.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay-4b7568b7.json | unsupported-replay | Replay solver version does not match this build |
| recordings/edgework-replay-4b7568b78444.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay-6f5c711f.json | unsupported-replay | Replay solver version does not match this build |
| recordings/edgework-replay-6f5c711f2.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay-a5a66c98.json | unsupported-replay | Replay solver version does not match this build |
| recordings/edgework-replay-a5a66c98pt9.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay-d0dfddc5.json | unsupported-replay | Replay solver version does not match this build |
| recordings/edgework-replay-ee907694.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay-f919d62f.json | invalid-json | Not repaired or replayed |
| recordings/edgework-replay.json | unsupported-replay | Replay solver version does not match this build |
| recordings/edgework-session-1.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-2.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-3.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-4.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-4b7568b7.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-5.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-6.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-6f5c711f.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-7.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-a5a66c98.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-d0dfddc5.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session-ee907694.json | summary-only | No per-tick positions or inputs |
| recordings/edgework-session.json | summary-only | No per-tick positions or inputs |
| owner-first-ice | measured-verified-pre-transfer | Benchmark-only: add exactly weightTransferMode=0 and weightTransferTime=0.25; every archived off digest matched |

Session summaries only link to replay files by tick count and final digest; they cannot supply missing tick trajectories. Older solvers and malformed JSON require their original compatible recordings/builds; they were neither repaired nor relabelled.

## First ice

The owner's live Godot save (`ice-run-replay.json`, modified 2026-11-11 18:02, read in place and never modified). The 2026-11-11 hand-off describes First ice as a 75 s replay with 5 falls and a mean speed of 0.64 m/s; this file measures 75 s, 5 falls and 0.642 m/s, which matches on all three. The hand-off's 17:55 stamp is not stored in the file, so identity rests on those three numbers. It is solver /39 without the two later transfer knobs, so it runs through the explicit disabled-transfer adapter, and every one of its 9000 archived digests matches with the param off.

| Param | Outside ticks | …of them fallen | Inbound / outbound / tangent | Max depth (mm) | Stuck intervals | Stuck seconds | Longest stuck (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| off | 552 | 424 | 0 / 366 / 186 | 8761.974 | 7 | 52.78 | 16.44 |
| on | 407 | 407 | 0 / 364 / 43 | 8761.974 | 5 | 41.36 | 16.44 |

First tick where the digest changes with the param on: recorder 1250, after collision 1249; 7751 of 9000 recorder ticks differ from there on.

Outside intervals, off: ticks 893–1260: 8761.974 mm, 356/368 fallen; ticks 3875–4006: 0.008 mm, 46/132 fallen; ticks 7991–8042: 0.095 mm, 22/52 fallen. On: ticks 893–1248: 8761.974 mm, 356/356 fallen; ticks 3875–3920: 0.008 mm, 46/46 fallen; ticks 7498–7502: 1.132 mm, 5/5 fallen.

Stuck intervals, off (first–last tick): 1261–3037, 3081–3290, 3404–4248, 4346–6318, 7277–8299, 8398–8640, 8738–9000. On: 1249–3037, 3081–3290, 3404–4248, 4346–6318, 7601–7746.

The 8.76 m depth is a fallen skater sliding out through the boards: `resolveRinkCollision` returns early for a fallen skater, in both modes, by the existing policy this prototype does not change.

The authored stuck diagnostic is speed ≤0.1 m/s within 2 mm of the boards for at least one second. It is a proxy, not a claim about what the player felt; every interval is in the JSON.

## Owner's choice

Recommendation: leave `boardsSnapInbound` off in every setup (Simulation, Explorer, Experimental, Dig Gate, Repertoire) for now. The inward snap does not unstick First ice: stuck time is 52.8 s off and 41.4 s on, its longest stuck interval 16.4 s off and 16.4 s on, and the digests diverge from tick 1250, so turning it on would also change how that recorded clip plays back (playback runs the same collision between ticks, game/main.ts:534). The only standing gap in the measured corpus is Katya Vell in the warm-up pilot, 97 ticks, 1.13 mm deep; with the snap on that falls to 10 ticks, all of them while fallen, at the same 1.13 mm, which comes from the fallen-skater policy the snap leaves alone. So the warm-up's 2 mm allowance cannot go back to 0 on this change alone; it could only if the owner also decides that a fallen skater is held by the boards. If you still want a zero standing gap, the narrowest place to turn it on is the warm-up pilot (game/warmup.ts), with the tolerance left at 2 mm; Godot's bridge/engine.mjs would need the param passed separately and was not touched. Authored: the 2 mm stuck proxy and every threshold in this document. Pending owner decision.
