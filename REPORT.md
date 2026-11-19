# REPORT — Qwen beatcross (measurement, not a behaviour change)

Brief: `.delivery/briefs/qwen-beatcross.md`. Hand_off.md open question 2: do
Experimental's automatic beat crossovers make a jump depend on the music?
Worktree `.delivery/beatcross`, branch `beatcross`, baseline `4aaf328`.
Session: `qwen-beatcross-75b8` (auric porter). **No push, no PR** — Claude Code
reviews and relays.

## Answer (one line)

Yes — the same clean-2Lo script stands at only **20 of 57** load phases across one
beat on the shipped setup; the beat's crossovers shape the entry and a load just
after a beat begins two-footed. The owner's hold-suppression option removes the
two-footed start (share **1.000 at all 57**) but also the crossover pushes this
entrance rode in on, so it stands at **0 of 57**. Full report:
`docs/beatcross-2026-11.md`; data: `docs/beatcross-2026-11.json`.

## What changed

New files (mine):
- `tools/ice-lab/bench/beatcross.ts` — the sweep. Canonical 2Lo entrance
  (`jpse/baseline.ts` BASELINE) with `loadAt` shifted across one beat period
  (0.46875 s @ 128 bpm) in 1-tick steps, 57 offsets, twice (lever 0 and 1).
  Closed-loop through `setupInput`, on the game's ice grid; every run
  replay-verified, carries its digest. Records support shares, crossover starts,
  L, call, airborne degrees, run-out, fall reason. `import.meta.main`-guarded so
  tests can import `runOffset`.
- `tools/ice-lab/test/beatcross.test.ts` — 7 tests: param default/validate, the
  guard is the hold not the crossover (released glide identical at 0/1; held glide
  suppressed only at 1), pinned sweep anchors (off 0 clean two-footed, off 36
  entry fall, on one-footed/no-crossover/fell-entry), determinism (same offset
  twice, digest and all).
- `docs/beatcross-2026-11.md`, `docs/beatcross-2026-11.json` — the report + data.
- `REPORT.md` — this file.

The single param and its guarded use (exact sites):
- `tools/ice-lab/sim/params.ts:949–961` — `beatCrossoverHoldSuppress: number`
  declaration + doc (mapping-only; the solver never reads it).
- `tools/ice-lab/sim/params.ts:1273` — default `0`.
- `tools/ice-lab/sim/params.ts:1478` — validate `0` or `1`.
- `tools/ice-lab/game/full-controls.ts:735–739` — the guarded use: `stand`,
  `standPull`, `heldTowardLoad` (lever ≥ 1, one foot, not mid-push, standing
  trigger pulled past `GESTURE_TICKS`), OR-ed into the existing `loading` that
  already gates `autoCrossover` at lines 740–744. At 0 `heldTowardLoad` is false
  and `loading` is exactly the shipped expression.
- `tools/ice-lab/sim/replay.ts:291–293` — /39 changelog note, **unbumped**
  (default-off mapping lever, the established convention).
- `tools/ice-lab/test/fixtures/replay-v1.json` — rebased via the sanctioned
  `node replay/rebase-fixture.ts`: `addedParams:["beatCrossoverHoldSuppress"]`,
  `frames:240`, `digestsUnchanged:true`. Only the new key at default 0; every
  input and digest unchanged.

Not touched: `native/reference/*` and its 93-param pin — already stale on main
(current DEFAULT_PARAMS has 219 keys; the native reference is frozen at the
93-param era and is not in the brief's verify commands; recent lever commits
`3c6c554`, `cd05bb3` did not regenerate it). No setup enables the lever; it is 0
in every setup. No solver, score, presentation or replay-contract change.

## Commands run (from the worktree) and outputs

Baseline before editing (`4aaf328`): ice-lab 1095 tests / 1094 pass / 0 fail /
1 todo; replay verify `{"verified":true,"ticks":240}`; Godot prepare 94 modules;
Godot 68/68. (The 1 todo is the documented fidelity-floor test
`discretisation.test.ts:332`, failing-by-design, exit 0.)

After the param + bench + tests:
- `(cd tools/ice-lab && node --test test/*.test.ts)` → **1102 tests, 1101 pass,
  0 fail, 1 todo**, exit 0 (1095 + the 7 new).
- `(cd tools/ice-lab && node replay/verify.ts test/fixtures/replay-v1.json)` →
  `{"verified":true,"ticks":240}`.
- `node games/ice-run-godot/tools/prepare.mjs --engine-only` → exit 0,
  "Prepared 94 Ice Lab modules".
- `node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs` →
  **68 tests, 68 pass, 0 fail**, exit 0.
- Typecheck: scratch `/tmp/qwen-beatcross-tsc` (`npm install typescript
  @types/node`), then from `tools/ice-lab`:
  `/tmp/qwen-beatcross-tsc/node_modules/.bin/tsc --noEmit -p . --typeRoots
  /tmp/qwen-beatcross-tsc/node_modules/@types` → **exit 0, no errors**.
- `node tools/ice-lab/replay/rebase-fixture.ts` →
  `{"from":"HEAD (ice-lab-f64/39)","to":"ice-lab-f64/39","frames":240,
  "addedParams":["beatCrossoverHoldSuppress"],"removedParams":[],
  "digestsUnchanged":true}`.
- `node bench/beatcross.ts` → both sweeps, all 114 runs replay-verified, writes
  `docs/beatcross-2026-11.json`.

Inertness proof (lever 0): the off sweep measured **before** the param existed
(`/tmp/qwen-beatcross-off-preparam.json`) and **after** is byte-identical across
all 57 records — every field, every digest (compared excluding only the
`fallReason` field added to the schema between runs). The full verify suite is
identical to baseline. Replay stays /39; every digest unchanged.

## Measurements (the two sweeps)

Off (shipped): 20/57 complete; 37 falls (35 LEAN EXCEEDED, 2 LANDING); 27 entry
falls (offsets 20–22, 33–56), 8 run-out falls (13, 15, 18, 23, 29–32), 2 landing
falls (1–2, under/downgraded). Load-start right share 0.531–0.978; blade-off share
1.000 on every takeoff. Crossovers fire at ticks 113, 169 in the entry (the beat at
57 is too shallow), then 338, 394, 450… in the run-out.

On (owner's option, literal reading): 0/57 complete; 57 LEAN EXCEEDED entry falls;
**0 crossovers**; load-start share **1.000 at every offset**. The canonical script
holds RT half from tick 0, so the hold suppresses the whole entry's crossovers;
without their pushes the glide is shallower/slower and every load leans past the
limit before release.

Mechanism probes (scratch `/tmp/qwen-beatcross-probe.mjs`, not committed): off
offset 36 falls LEAN EXCEEDED at tick 261 (lean −0.88 at load → −1.13, release due
267); off offset 21 the same at 240 with a diverging balance error (−1.54); on
offset 0 falls at 216 (lean −0.69 at load → −1.16, release due 231), entry glide
lean −0.64 / speed 6.56 vs off −0.88 / 6.78 at tick 160.

## Open questions for the owner

1. **The choice** (spelled out in `docs/beatcross-2026-11.md` §"The owner's
   choice"): keep 0; or adopt 1 **and re-search the entrance** (the lever is sound
   for a released-glide-then-hold posture, but the searched canonical script holds
   throughout and loses its propulsion); or refine the reading. Recommendation:
   do not ship 1 on by default — it breaks the canonical entrance.
2. **"Held toward a load" threshold.** Prototyped as any standing-trigger hold
   past the snap window on one foot. A narrower reading (only holds ≥ `PUMP_HIGH`
   0.6) would not suppress the script's RT half (0.474) and would leave this
   entrance unchanged — the existing load guard already stops crossovers at
   RT ≥ 0.7. Which reading does the owner want? The 0/57 result is specific to the
   literal reading + this script.
3. **Scope of the measurement.** One entrance, one speed (7 m/s), one bpm (128),
   Experimental only. Should the sweep be re-pointed at other jumps/speeds/tracks
   before the decision? The bench takes BASELINE and params as given.

## Hard rules honoured

Worked only in `.delivery/beatcross`; never touched the outer checkout or another
worktree. No deletes/resets/clean/force-push/`checkout --`. No process kills.
Presentation/sim/score untouched; new physics behind a default-off mode; replay
/39, every digest unchanged. Measured before claiming; authored numbers labelled
(authored: weightTransferTime 0.25, musicBpm 128, strokeDuration 0.30,
jumpLoadKnee 0.7). No test loosened; the fixture rebase is the sanctioned
default-off recipe (digests unchanged), not a re-pin of behaviour. Commit on
`beatcross` with Co-Authored-By; no push, no PR.
