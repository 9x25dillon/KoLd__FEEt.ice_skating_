# Baseline — `main` @ `281bf8d`

**What the repository measured at commit `281bf8da8072e9604a751dc4cf625d8c73fd87a1`
(Merge PR #111), before the fidelity-ascension work changed anything.** Later regressions are judged
against this page. Every number carries the command that produced it. Run each from the repository
root unless it says otherwise.

Observed 2026-11-14 (PST) in a fresh worktree off `origin/main`. Machine: Intel Core i9-9900K,
16 logical cores, Linux 7.3.4, Node v26.13.1. No number here is a claim about another machine.

Two tools on this page were written for it and are not part of `281bf8d` itself:
`tools/ice-lab/bench/fingerprint.mjs` and `tools/ice-lab/bench/bridge-latency.mjs`, plus
`tools/ice-lab/test/discretisation.test.ts`. They read the solver and the bridge and change neither;
the commit that adds them touches nothing under `sim/`, `game/` or `games/`.

---

## 1 · Verification steps, as CI runs them

| Step | Command | Observed |
| --- | --- | --- |
| Commit | `git log -1 --format=%H` | `281bf8da8072e9604a751dc4cf625d8c73fd87a1` |
| Ice Lab suite | `cd tools/ice-lab && node --test test/*.test.ts` | **1084 pass, 0 fail**, 0 skipped, 0 todo; 17.0 s |
| Replay fixture | `cd tools/ice-lab && node replay/verify.ts test/fixtures/replay-v1.json` | `{"verified":true,"ticks":240}` |
| Bridge prepare | `node games/ice-run-godot/tools/prepare.mjs --engine-only` | `Prepared 94 Ice Lab modules (audio conversion skipped).` |
| Godot bridge tests | `node --test games/ice-run-godot/tests/*.test.mjs` | **68 pass, 0 fail**; 7.4 s |
| Unreal contract tests | `node --test games/ice-run-unreal/tests/*.test.mjs` | **6 pass, 0 fail, 2 skipped** (the live smoke needs `UE_ROOT`) |
| Fidelity validator | `cd tools/ice-lab && node validate.mjs` | **8 pass, 0 fail, 25 unsourced, 0 unmodelled**, exit 0; gate **not met** |
| GitHub Actions | `gh run list --branch main --limit 6 --json workflowName,conclusion,headSha` | "Ice Lab checks": **success** at `281bf8d` (run created 2026-11-15T03:31:55Z) |

The suite took 132 s in the 2026-11-15 review's 2-vCPU sandbox and 17 s here. The counts are the same.

**Not run here:** `node app/build.mjs`; the Godot smoke test (`godot4 --headless … --smoke-test`); the
Unreal build and its live smoke; the typecheck; anything on a physical pad. "Native replay foundation"
was last seen green on GitHub at `87bd418`, the commit before; it did not run at `281bf8d` because
that merge touched nothing under `tools/ice-lab/`.

## 2 · Fidelity gate coverage

`cd tools/ice-lab && node validate.mjs` — external passing cases per class, of the three §6.3 needs:

| Class | Cases | Pass | Unsourced | External passing |
| --- | ---: | ---: | ---: | ---: |
| O1 carve relation | 6 | 4 | 2 | 0 / 3 |
| O2 tracing curvature | 2 | 0 | 2 | 0 / 3 |
| O3 edge transitions | 7 | 0 | 7 | 0 / 3 |
| O4 speed decay | 5 | 1 | 4 | 1 / 3 |
| O5 jump rotation | 7 | 3 | 4 | 1 / 3 |
| O6 moment of inertia | 3 | 0 | 3 | 0 / 3 |
| O7 propulsion | 3 | 0 | 3 | 0 / 3 |

The two external passes are `glide-hockey-sled-federolf2008` (two-sided, deviation 0.0024 m/s² inside
0.0181) and `air-time-isolated-jumps-bruening2018` (one-sided: 0.5917 s against at least 0.44 s). The
other six passes are derived cases, which check the implementation and never count toward coverage.

## 3 · Numerical floor

`cd tools/ice-lab && node --test test/discretisation.test.ts` — a held edge on `responsive`, 2.0 s to
settle, then three windows of a third of a second; radius from the circle through the three
window-end positions; 120 Hz against 960 Hz.

| Speed | Lean | R at 960 Hz | Radius error, relative | Lean-residual drift | Position error | Observed order |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 4 m/s | 20° | 3.6269 m | 5.10 × 10⁻⁵ | 2.88 × 10⁻³ ° | 19.9 mm | 1.22, 1.58 |
| 4 m/s | 30° | 2.2738 m | 1.34 × 10⁻⁴ | 1.25 × 10⁻² ° | 12.1 mm | 1.21, 1.58 |
| 6 m/s | 20° | 7.9501 m | 1.68 × 10⁻⁴ | 1.53 × 10⁻³ ° | 43.8 mm | 1.22, 1.58 |
| 6 m/s | 30° | 4.9993 m | 2.43 × 10⁻⁴ | 1.92 × 10⁻³ ° | 55.0 mm | 1.21, 1.58 |

The 4 m/s, 30° row is not a held edge: that skater is down by 6 s. Its numbers are a transient's.

**These do not match the review's figures** (radius 4.3 × 10⁻⁵, lean drift 4.7 × 10⁻⁴°, from one
case). See [divergences/numerical-floor-vs-review.md](divergences/numerical-floor-vs-review.md).

Settling ripple in the validator's own residual (per-tick, over 1 s after a 2 s settle, 4 m/s at 20°):
**1.6 × 10⁻² °** peak to peak, the same figure the review reported. After the gate's 5 s settle it is
7 × 10⁻⁵ °. Measured with a scratch probe, not a committed command; the reproducible numbers are in
the table above.

## 4 · Determinism fingerprint

3600 ticks of `responsive` under a fixed varying input; every tick's state checksum folded into one
FNV-1a word.

| Run | Command | Fingerprint | Final position |
| --- | --- | --- | --- |
| `.ts` solver, process A | `node tools/ice-lab/bench/fingerprint.mjs` | `0x0d3732cb` | 5.020208150204986, 11.56603401074728 |
| `.ts` solver, process B | the same again | `0x0d3732cb` | identical |
| generated JS | `node tools/ice-lab/bench/fingerprint.mjs --runtime` | `0x0d3732cb` | identical |
| generated JS, interpreter only | `node --jitless tools/ice-lab/bench/fingerprint.mjs --runtime` | `0x0d3732cb` | identical |

`node --jitless tools/ice-lab/bench/fingerprint.mjs` (the `.ts` path) fails with
`ERR_WEBASSEMBLY_NOT_SUPPORTED`, as the review said it would: Node strips types with WebAssembly,
which `--jitless` turns off.

The review's fingerprint was `0x160e3bee`. It came from the review's own input script, which is not in
the repository, so the two words cannot be compared. What reproduces is the property: one word across
processes, across the `.ts` and generated-JS paths, and across V8 tiers.

## 5 · Bridge latency, host side

`node tools/ice-lab/bench/bridge-latency.mjs 75` — the real `host.mjs` over stdin and stdout, 4500
`frame` requests of 2 ticks, one in flight, including `save()` and the process boundary.

| Metric | mean | p50 | p90 | p99 | p99.9 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Round trip, ms | 0.695 | 0.680 | 0.755 | 0.948 | 1.459 | 6.282 |

- Requests over 16.67 ms: **0 of 4500**. Over 8.33 ms: **0 of 4500**.
- Host work: 41.7 ms per simulated second, **24.0× real time**.

The review's sandbox (2 vCPU) measured p50 0.56 ms, p99 4.6 ms, p99.9 31.5 ms, with 0.87% of requests
over 16.67 ms. The tail it reported **did not reproduce on this machine**, which is the owner's. That
supports the review's second candidate cause, contention on two cores, but one run on one machine does
not settle it. GC pauses were not re-measured here.

**Reply size.** Mean 18.4 KB, by fifth of the run: 14.4, 17.1, 18.9, 20.8, 20.8 KB. That is not the
review's flat 13.4 KB, and the difference is the input, not the ice trace. A reply with no element
skated is 13.2 KB. This run's input jumps and turns, and each element adds a telemetry card to
`elementCards` (PR #103), which is sent whole in every frame. The list is capped: a 600 s run of the
same input stays at 20.7–20.9 KB. So the reply is **bounded, not growing with run length**, but it is
not flat, and about 6.7 KB of every reply at the cap is cards that did not change. Recorded, not
changed: nothing here shows the size costs a frame.

## 6 · What this baseline does not contain

- Any measurement of fidelity against real skating beyond the two external cases in §2.
- Client frame time, render time, or tick-debt behaviour in Godot or Unreal.
- The physical pad.
- The review's probe scripts. They lived outside the checkout, so its exact numbers are quoted above
  only where this page says "the review".
