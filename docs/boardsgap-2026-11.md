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

The JSON includes every contiguous outside interval, inbound/outbound/tangent counts, fallen counts, total and longest duration, pre-collision measurements, raw positive-distance counts, input SHA-256 hashes, and digest-stream hashes. Unsupported recordings are not zero-gap results.

## Warm-up reproducer

| Skater | Off ticks | On ticks | Off max depth (mm) | Off seconds | Longest interval (s) |
|---|---:|---:|---:|---:|---:|
| Ansa Merrow | 0 | 0 | 0.000000 | 0.000000 | 0.000000 |
| Lio Tarrant | 0 | 0 | 0.000000 | 0.000000 | 0.000000 |
| Katya Vell | 97 | 10 | 1.134692 | 0.808333 | 0.808333 |
| Noor Ashdown | 0 | 0 | 0.000000 | 0.000000 | 0.000000 |
| Remi Castellan | 0 | 0 | 0.000000 | 0.000000 | 0.000000 |
| Teodora Wynn | 0 | 0 | 0.000000 | 0.000000 | 0.000000 |

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

Session summaries only link to replay files by tick count and final digest; they cannot supply missing tick trajectories. Older solvers and malformed JSON require their original compatible recordings/builds; they were neither repaired nor relabelled.

## First ice

Missing: the 2026-11-11 17:55 recording is not in the specified corpus

The authored stuck diagnostic is speed ≤0.1 m/s within 2 mm of the boards for at least one second. It is a proxy, not a claim about what the player felt; intervals are in JSON when the run is available.

## Owner's choice

Pending owner decision: keep the shipped behavior (default off), or authorize enabling inward snapping after reviewing replay changes. This experiment does not enable it in gameplay.
