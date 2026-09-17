# Hand-off

## Current checkpoint — 2026-09-17, thirteenth session: a designed curve for the Slalom, a second Godot skater, spinLevel to 3, PCS, and step sequences

Still on **`ue-replay-01-foundation`**, seven commits, each tested and verified live before the next
began — the browser Ice Lab, Godot, or both, every time; see each item. This session opened on
"keep cooking" with no stated priority (see the review below) and closed having cleared the queue's
oldest item, the operator's own explicit two-part ask, and two smaller loose ends the queue had
flagged.

**In order:**

1. **The oldest open thread in this file, closed.** The tenth session's queue asked for "a designed
   curve for a real course" beyond the Figure Eight; the Slalom (`app/edges.ts`) had a guide line
   (`guideY`) but scored only discrete gate pass/fail. It now also scores RMS deviation from that same
   line — a live "off the line" readout, `accuracy` folded into the score — the exact pattern
   `figure8.ts`'s own `deviation()` already proved. Paired with it: `app/draw.ts`'s point-trace was
   capped at ~4,000 points (~30 s); `sim/ice.ts`'s `IceGrid` now also backs a second, uncapped picture
   — a canvas painted incrementally from `condition()` at each blade's own contact cell, one pixel per
   grid cell, gated on `iceGridMode` so tuning work with it off is unaffected. New Ice panel group in
   the Lab turns it on; `IceGrid` gained `cellAt()` and `coverage()` (the latter used again in item 6).
   `ef91292`.
2. **The Black Berserker**, on the operator's own ask ("any way we can use this on our character?"),
   asked which of three integration depths and told to add it as a second, selectable character. Built
   on `build_skater.py`'s *exact* armature — not the operator's own draft script's bone names or its
   rigid bone-parenting — because `scripts/skater.gd` poses eleven bones by exact string match; a
   mismatched rig would simply stand inert, never error. `scripts/main.gd` gained a Settings → Skater
   picker; `.gitignore`'s allowlist extended. Verified: a standalone Blender render, a clean Godot
   import, and a full career routine completed headless with the Berserker selected. `a55e8f4`.
3. **The Godot HUD had no surface for a spin's level at all** (flagged by the twelfth session's own
   §0) — `bridge/engine.mjs` now tracks it live the same way `game/main.ts`'s own free-skate HUD
   already does (`SpinLevelTracker`, scored the moment a spin ends), exposed as `spinLevel` in the
   snapshot; `scripts/main.gd` shows it beside the jump TES total `engine.mjs` already computed but
   never displayed either. Verified with a real driven spin through `engine.tick()` directly. `0cb796e`.
4. **Mid-spin direction reversal** — `data/spin-features.json`'s own note on `both_directions`:
   *"killing all angular momentum and regenerating it in the opposite sense... the simulation gets this
   almost for free: the sign of L flips."* `sim/moves.ts`'s `spinTick` does close to exactly that: held
   lean opposite `Sp.dir`, past a stick threshold, checks the spin; near zero, it flips and
   regenerates. **The one real bug, found by measurement, not assumed away**: the ordinary "too slow,
   check out" exit fired *during* the deliberate near-zero dip a check is, ending the spin instead of
   reversing it — held off for exactly as long as an active check is in progress. `spinLevel`'s honest
   ceiling moves from 2 to **3** of 10. Replay `/14` — the first bump not guarded by a brand-new Mode
   flag at 0 (it lives under `movesMode`, already 1 in live play), so fixture safety was checked
   directly against the committed clip rather than assumed. Verified live in the browser: the HUD's
   direction arrow visibly flips mid-spin. `832e62a`.
5. **Flow's "dead air between elements"** — one of the bible's three bullets this file has called
   unmodelled since the twelfth session; the clearest-defined of the three (the other two, "alternating
   lobes" and "repeated lobes in the same direction", are one signal with no per-tick curvature tracker
   and no calibration basis — still open, see the queue). Once an element has finished once, a grace
   period past it with nothing new under way costs flow. Replay `/15`, checked the same direct way as
   item 4. `6c574c5`.
6. **Program Component Score** (`sim/pcs.ts`) — TES has existed since the jump work; this is the PCS
   half. The formula and the component factor are transcribed (`data/segment-rules.csv`, unread by
   anything until now, matches `ScoreCalculator.cs`'s own inline comment exactly). **The mapping from
   physics to a 0..10 score is not transcribed, and the file's own header says so in those words** — no
   data file gives PCS the ISU-precise thresholds `spin-features.json` gives a spin. `IceGrid` gained
   `coverage()` for Composition's own "ice-coverage map" bullet. Standalone and tested, the same stage
   `sim/spinLevel.ts` was in before this session — **not yet wired into `game/career.ts` or either live
   game.** `9b895d3`.
7. **Step sequences**, the operator's own explicit second half of one message: *"lets program the
   [components] score and then build the step sequence mechanic... execute the choreographed routines
   that will hopefully sync with the music engine."* `sim/stepLevel.ts` scores
   `data/step-features.json`'s variety ladder; a new `step` element in `game/career.ts`'s `ELEMENTS`
   makes it real and Composer-authorable, picked up generically by both `bridge/engine.mjs` and
   `scripts/main.gd` (one hardcoded whitelist in the latter's own preference loader was the exception,
   fixed alongside). Music sync is inherited for free from the existing beat-grid credit on turns — no
   new mechanic needed for that half of the ask. **This rig's own honest ceiling is grade 1 of 4,
   exactly**: six observable footwork types (bracket, twizzle "difficult"; three-turn, mohawk "simple";
   change-of-edge; crossover, not in the ISU's own taxonomy but counted as a seventh rig-specific type)
   against a ladder whose grade 2 needs seven, full stop. **Found and fixed a real production bug on
   the way**: `data/step-features.json` was fetched by `game/main.ts` but never in `app/build.mjs`'s
   data-file copy list, so the actual served build 404'd on it, invisible to every test that imports
   the module rather than fetching it — caught with Playwright against the real served build, not a
   unit test, and now guarded by a new regression test in `test/app-loads.test.ts`. `f82c400`.

**Not wired in, on purpose:** "step" is Composer-authorable in Godot but not in any of the five fixed
`CAREER_EVENTS` routines — a content decision about an existing difficulty progression, left for the
operator. PCS is not called from anywhere in play yet.

**Verified at every step in the actual running app** — browser (Playwright, the Ice Lab and the game
both), Godot (a headless `--smoke-test` after every physics-affecting change, plus one standalone
Blender render) — never only in tests. 408 Ice Lab tests (up from 374), 10 Godot bridge tests, `tsc`
clean throughout, `docs/fidelity-report.md` untouched (nothing this session touches the fidelity gate's
own solver corpus). Replay contract `ice-lab-f64/15`.

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain untracked on
purpose — left alone, per the note further down.

---

**Last session: 2026-09-17, twelfth session — the whole 2026-09-14 queue closed, plus three loops back.**

Still on **`ue-replay-01-foundation`**, seven commits today, each verified and merged to `main`
individually (PRs #7–#10, all green). This is the session that finally cleared **every item** the
tenth session's queue (below, now historical) left open — the carve question, the career module, the
stat-balance link, the stamina pools — and then kept finding the same shape of gap twice more after
that.

**In order:**

1. **The carve question, asked first, as the old §0 said to.** The operator chose **a designed curve**
   over a replay ghost. `sim/ice.ts`: a 12 cm damage/snow grid, read back into friction (`muLong`,
   `biteCapacity`) and deposited by every blade pass, 0 in every preset (`iceGridMode`). Passed into
   `step()` as an explicit optional argument — never a hidden global — the same way `SkaterState`
   itself is. Replay `/10`. `0bb3a53`.
2. **The career module already existed** (`game/career.ts`, built 2026-09-15 and not yet visible in
   this file's own queue below — the tenth session's queue was already one session stale when this one
   opened). What was missing was the operator's chosen link: **stat balance tied to the competitive
   scoring**. `CareerState` now tracks `medalCap` (the old sequential unlock) and `statCap` (the
   highest of `profile.ts`'s `TIERS` `overall()` clears) separately; `unlocked` is the lower of the
   two — a clean program can no longer outrun the training behind it.
3. **Stamina** (bible §2.8): `Wind`/`Legs`, draining from time/speed/pushes/jumps/sit-spins/deep edges,
   recovering slowly (`Legs` gated by `Wind`). Feeds jump height, pull-in tightness, edge depth, and a
   new deterministic balance-loop noise term. `staminaLegsPerPush` is the one number that survives from
   `src/reference/SkateSolver.cpp`'s otherwise-undefined `UpdateStamina`/`StaminaGain`. Replay `/11`.
   `68f6088`.
4. **Hype** — the operator's own bridge, quoted below at the tenth session's own entry, finally built:
   builds from clean landing streaks, reads `musicMode`'s accent credit as an input, feeds back into
   control assist on top of stamina's own fatigue blend. **Found a real, silent, pre-existing bug
   while wiring it**: a landing resolves inside `jumpAir`, on `step()`'s early-return path, which had
   *always* skipped music credit for a landing — only a turn's cusp ever reached it, since nothing had
   ever driven a jump with `musicMode` on and checked `musicCredit` itself. Fixed by factoring the
   event scan into a shared `landingAndTurnCredit`, called from both places. Replay `/12`. `8686590`.
5. **Flow** (bible §2.6), the last of the three the operator's own brief named. Only the
   physics-observable half of the bible's rises/falls table is modelled — no pose data, and a spin's
   blade tilt *is* its rotation direction here, so `change_of_edge` would double-count `both_directions`.
   Feeds Wind's own drain rate. Replay `/13`. `4635e92`.
6. **Wired all four into the actual game.** Discovery: none of the above had ever been turned on for a
   real player — `GAME_PARAMS` never set any of their `Mode` flags. Turned them on, gave `game/main.ts`
   a real `IceGrid`, added HUD readouts (`Wind NN% · Legs NN%`, `Hype NN%`, and an **EDGE** bar — *not*
   called "flow" on purpose, see below). **Found the same shape of bug as item 4, in a different
   place**: `ReplayPlayer` never owned an ice grid either, so a live session recorded with one would
   silently diverge on replay — and `games/ice-run-godot/bridge/engine.mjs`, a hand-maintained mirror
   of the same host logic, had the identical bug twice over (its live engine, and its own test's
   reference solver call). All three fixed the same way: give the reference path its own grid. `a9ecac4`.
7. **Two more rounds of the exact same gap, found by asking "what else is computed and shown but never
   scored."** Hype/flow reached career XP (averaged over a routine, bonus gated the same anti-farming
   way the medal XP already was). Then **a spin's ISU level, for the first time** (`sim/spinLevel.ts`):
   went through all ten features in `docs/level-features.md` and found eight genuinely out of reach —
   three need pose/joint data this reduced-order rig does not have, five need a combination-spin or
   direction-reversal mechanic it does not have either — documented feature by feature in the file's
   own header rather than faked. The remaining two score from `data/spin-features.json`, never
   hardcoded, capping honestly at level 2. Then the real jump TES and that spin level *also* reached
   career scoring, the same gap closed a third time. `c0ce9e8`, `fbb7eee`.

**The EDGE-vs-FLOW naming collision, caught before it shipped**: `game/index.html` already had an
unrelated `FLOW` bar (`playground.flow`, a free-skate speed/style meter, nothing to do with bible
§2.6). The new scalar reads as **EDGE** in the HUD instead, its own colour, beside the original.

**Verified at every step in the actual browser, not only in tests**: built, served
(`node app/build.mjs && node app/serve.mjs`), and driven headlessly with **Playwright**, found already
installed (with its Chromium binary) under a *different* local project's `node_modules`
(`/home/kill/astro-aae/frontend/node_modules/playwright`) — a much better tool for this than the raw
CDP scripting the tenth session's toolchain notes describe; see the updated notes below. Pushing to
speed and holding a carve took EDGE from 0 to 97%; a held spin, arms pulled in mid-hold, scored a real
level 2; career mode opened and played with no console errors. No `puppeteer`/`playwright` is a
project dependency — it was borrowed, read-only, from a sibling checkout each time.

374 Ice Lab tests (up from 322), 8 Godot bridge tests, `tsc` clean, `docs/fidelity-report.md`
byte-identical throughout (the gate's own configuration never touches any of the new `Mode` flags).

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain untracked on
purpose — left alone, per the note further down.

---

**Last session: 2026-09-15, origin/main merged into `ue-replay-01-foundation`.**

Still on **`ue-replay-01-foundation`**. This closes the branch-divergence reconciliation
`## 0 · Start here` below had flagged as open for three sessions running (its old item 1,
now marked resolved). The operator asked to find the latest interrupted session — a merge
of `origin/main` into this branch, conflicts already hand-resolved in the working tree but
nothing staged, committed, or pushed — and finish it.

- All 13 conflicted files (`.github/workflows/ice-lab-checks.yml`, `README.md`,
  `tools/ice-lab/README.md`, `app/pad.ts`, `app/schemes.ts`, `sim/params.ts`, `sim/replay.ts`,
  `sim/solver.ts`, `sim/types.ts`, `test/fixtures/replay-v1.json`, `test/padview.test.ts`,
  `test/rink.test.ts`, `test/schemes.test.ts`) had already been resolved with no leftover
  conflict markers — verified rather than trusted, file by file.
- The `test/rink.test.ts` naming collision is resolved as prescribed: this branch's
  game-boundary test kept the name; main's ice-surface-curvature test moved to
  `test/rink-relief.test.ts`. Both suites pass.
- `REPLAY_SOLVER` renumbered to **`ice-lab-f64/9`** (this branch's music/bracket and main's
  rink-relief/wind-up had each independently reached `/8`); `test/fixtures/replay-v1.json`
  regenerated for the union.
- The **U**-key collision (this branch's low pose/cantilever vs. main's jump wind-up) is
  resolved: **U** stays low pose; wind-up now arms on comma; a low pose disarms wind-up
  (`game/controls.ts`, `game/main.ts`).
- `docs/fidelity-report.md` regenerated against the merged solver so CI's byte-identical
  check passes; the bracket case moves from unmodelled to unsourced now that the turn
  exists on this branch.
- Found and fixed one real bug on the way, unrelated to the merge itself: `test/game-effects.test.ts`
  had `assert.equal(effects.landing, null)` — `assert.strict`'s `strictEqual<T>(actual, expected):
  asserts actual is T` — pinning the mutable `landing` property to `null` clear across a later
  method call, a `tsc` failure (`test/game-effects.test.ts(44,64)` etc., "Property does not exist
  on type 'never'"). Fixed by asserting the boolean (`effects.landing === null`) instead of the
  property directly.
- Verified clean before committing: 322 Ice Lab tests, 8 Godot bridge/host tests, `tsc --noEmit`,
  `app/build.mjs`, `replay/verify.ts` (240 ticks), and `validate.mjs` — fidelity gate still **not
  met**, deliberately: no case in the corpus is externally sourced yet, only the derived ones pass.
- Committed as `32f6d3c` and pushed to `origin/ue-replay-01-foundation`.

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain
untracked on purpose — left alone, per the note below.

---

**Last session: 2026-09-15 (career/Godot resume), on `ue-replay-01-foundation`.** Recovered another
interrupted session's career and Godot work, on the operator's ask to continue and commit/push it:
browser Ice Run gained five career events, ordered choreography, medals, unlocks, XP training and
local saves (`game/career.ts`); `games/ice-run-godot/` became a playable Godot project whose Node
pipe host runs the unchanged Ice Lab simulation and renders a rigged Blender skater, rink/traces,
cameras, music, career and a simple ordered Composer editor — **not yet a native GDScript/C++
physics port**. 296 Ice Lab tests and 8 Godot bridge/host tests passed; both the editor runtime and
the Linux export completed a full career routine, and a rendered capture caught washed-out lighting
that was corrected. Explicitly did not touch `main` or attempt the branch-divergence merge below —
that fell to the next session, above.

---

**Before that: 2026-09-14 (tenth), on `ue-replay-01-foundation`, three commits. Repo state: everything
the ninth session left, plus a standalone game (Free Skate, a guided Rookie course, a 90-second light
run) on the same solver; a rhythm layer (beat-timed crossover pushes, musical credit) with five of the
operator's own tracks actually playing; a new turn, the bracket; a skirt and a ponytail on the skater;
and a rink boundary the skater bounces off of or crashes into. `main` has moved separately and further,
on a different feature set — see item 1 below before assuming a merge is simple.**

Read this before touching anything. It covers what exists, what is decided, the conventions that
hold the document set together, and the things most likely to trip you up.

> **This line changed.** Until 2026-09-08 this file said *"zero implementation."* That is no longer
> true: `tools/ice-lab/` is real, runs, and has 249 passing tests, including replay capture and a
> verifier that replays a clip recorded in one JavaScript engine in another.

## 0 · Start here (written at the close of 2026-09-17, thirteenth session)

### First, before anything else

1. **`sim/spinLevel.ts` scores 3 of the 10 ISU spin features, not 2.** `both_directions` is real now
   (`sim/moves.ts`'s `spinTick`, a held reversal). The 8-feature language anywhere older than this
   session is stale. Four genuinely remain out of reach — `change_foot_by_jump`,
   `difficult_change_of_foot`, `all_three_positions_second_foot` (all need a foot change mid-spin;
   `spinStart` sets `Sp.foot` once, `spinTick` never reassigns it), `jump_within_spin` (needs the jump
   and spin systems to compose, which they do not) — plus the three **declared** features needing pose
   data this rig does not have. Leave those alone unless a session is explicitly about pose fidelity.
2. **`sim/stepLevel.ts` scores grade 1 of the step-sequence ladder's 4, exactly, not approximately.**
   Six rig-observable footwork types against a ladder whose grade 2 needs seven, full stop — read the
   file's own header before assuming a small addition moves this. Raising it needs either a new
   "difficult" turn (rocker, counter — neither exists) or a new "step" (chassé, toe step, cross roll,
   running step, cross behind/in front — none exist; only change-of-edge does).
3. **`sim/pcs.ts` exists, is tested, and is called from nowhere in play.** The same stage
   `spinLevel.ts` was in before this session. Wiring it into `game/career.ts` needs a discipline/segment
   assigned to each `CareerEvent` first (none exists — the five events have no short/free distinction).
4. **The `step` element is Composer-authorable in Godot, not in any of the five fixed
   `CAREER_EVENTS`.** Deliberately left as the operator's own content call, not a technical one —
   adding it to an existing routine changes that routine's difficulty curve.
5. **Every new number this session is L3: authored, not measured**, the same standing note every prior
   session has carried forward — `spinReverseStick`/`-Rate`/`-Floor`/`-Regen`, `flowDeadAirTime/-Loss`,
   and PCS's entire physics-to-score mapping (`rise()`'s floor/ceiling pairs) most of all. None of it
   has been played, only tested for direction and perceptibility.
6. **`BEGINNER_PARAMS` still inherits every system via spreading `GAME_PARAMS`, unexamined** — carried
   over unresolved from the twelfth session; still true, still nobody has watched a beginner feel it.
7. **Flow's "alternating lobes" / "repeated lobes in the same direction" is still one unmodelled
   signal** (closed this session: "dead air between elements", the third bullet). No per-tick
   curvature-direction tracker exists and no calibration basis was identified for one — genuinely open
   design work, not a quick addition; see the queue.
8. **Replay contract is `ice-lab-f64/15`.** Two bumps this session (`/14`, `/15`) were the first ever
   *not* guarded by a brand-new Mode flag at 0 — both live under flags (`movesMode`, `flowMode`)
   already 1 in real play, so each was checked directly against the committed fixture's own digests
   rather than assumed safe the way every earlier bump could be. If a future bump also lands under an
   already-on flag, do the same direct check — do not assume the old "new flag, defaults 0" argument
   still applies just because the pattern looks the same.
9. **A second Godot skater exists** (`scripts/main.gd`, Settings → Skater) — Violet stays default.
   `tools/build_berserker.py` regenerates it; both build scripts must keep constructing the *identical*
   armature (`Hips, Spine, Head, Thigh/Shin/Foot L/R, Arm/Forearm L/R`) or `skater.gd` silently stops
   posing whatever changed.

**Untracked on purpose, at the repo root:** `E_W_replays_sessions_eng_bld/` (the operator's play data),
`Ice Lab — KoLd__FEEt edgework.html` (a browser save page), and `session-notes/`. Use only the play
data that is there; commit or delete none of the three without asking.

### The queue, next

Roughly in the order that unlocks the most, not an order the operator has stated:

1. **Wire PCS into `game/career.ts`.** Needs a discipline/segment field on `CareerEvent` (none exists)
   before `scorePcs` has anything to key off; the scoring module itself is done and tested.
2. **Alternating / repeated lobes** (flow's last unmodelled bullet). Needs a per-tick
   curvature-direction tracker — no existing signal fits directly; this is design work, not wiring.
   Whatever shape it takes should probably also feed `stepLevel.ts`'s own honest ceiling, since "lobe
   variety" is one of Composition's own four "driven by" bullets too (`sim/pcs.ts`'s header).
3. **A foot change mid-spin (a real combination spin).** Unlocks three more `spinLevel.ts` features on
   its own and is the one mechanic `sim/moves.ts` still lacks for a genuinely higher spin ceiling.
4. **A new step or turn type** (rocker, counter, chassé, toe step, cross roll — any one) would move
   `stepLevel.ts` toward its own grade 2. Seven distinct types is the bar; six exist.
5. **Decide whether "step" belongs in a fixed `CAREER_EVENTS` routine**, and if so which one and where
   in the sequence — an operator content call, not a technical one (§0 item 4 above).
6. **`games/ice-run-godot`'s HUD still doesn't surface the step element's own live progress** — jump
   TES and spin level both reached the Godot HUD this session (in an earlier and in this session's own
   part 3); step never got the equivalent readout.
7. **`BEGINNER_PARAMS`'s blanket inheritance** (§0 item 6) — still open, still needs the operator
   watching a fresh player before assuming it is fine either way.

**The native track, in its report's order** (unchanged, still not touched): a strict native JSON
importer from `native/reference/wire-manifest.json`; transcribe `createState`, the blade and
classification, and the ground solver from the pinned `/5` source; a runner with oracle comparison and
first-difference diagnostics; only then an Unreal module and commandlet on a pinned UE installation.

### Working with this operator — what held up on 2026-09-17 (thirteenth session)

The full review — key decisions, unresolved assumptions, three places each side could have moved
faster, and vocabulary to study — is in §8 below, under "The thirteenth session's shape," in the same
depth every prior session's own review has kept. The short version, for a session in a hurry:

- **"Keep cooking" / "n/a" recurred as the whole instruction twice**, the same pattern the twelfth
  session's own review already named once — see §8 for why a standing priority order, stated once,
  would remove the repeated framing round trips this keeps costing.
- **A mid-session ask ("any way we can use this on our character?") named neither the character nor
  the system** (the browser's 2D figure, or the Godot 3D model — two different rendering pipelines
  entirely) — investigation before a single line of code, resolved by asking. Naming the target up
  front is cheap; guessing wrong is not.
- **Verify in the actual running app, every time, kept paying off again** — this session's two real
  bugs (the too-slow spin exit firing mid-check; `step-features.json` 404ing in the real served build)
  were both found by driving the built artifact, not by reading the diff. The second one specifically
  would never have shown up in any test that imports a module rather than fetching it — keep testing
  the build's own file list, not just the code.
- **A tool-use slip worth naming so it does not repeat:** `ScheduleWakeup` is a `/loop`-mode tool; using
  it to "wait" for an unrelated backgrounded Bash task produced a stray `n/a` turn that looked like user
  input and was not. The correct move when waiting on a `run_in_background` command outside `/loop` is
  to simply end the turn — the harness delivers a task-notification on its own; do not schedule
  anything to manufacture one.

**Toolchain reminders, updated:** `npm run typecheck` still fails (no `tsc` on the box); scratch-install
`typescript`+`@types/node` and run `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from
`tools/ice-lab/` — clean at every commit this session too. **For a real browser check, prefer
Playwright** from `/home/kill/astro-aae/frontend/node_modules/playwright` (still there, still not a
dependency of this repo — read-only borrowed each time) over raw CDP scripting; its notes on headless
CDP scripting are otherwise still accurate for a machine without it. The native build commands are in
`tools/ice-lab/native/README.md`. **New this session:** `app/build.mjs`'s data-file copy list
(`for (const f of [...])`, currently four files) is curated by hand, not a glob of `data/` — a new
`fetch("../data/whatever.json")` in `game/main.ts` needs a matching entry there too, or the served
build 404s silently while every module-import test stays green. `test/app-loads.test.ts`'s "every
data/ file game/main.ts fetches is one app/build.mjs actually ships" test now catches this
specifically; keep it passing rather than loosening it. The README's test count is 408.

---

## 1 · What this is

**Edgework** — a physics-first figure skating simulation. Mostly design specification; the first
code is a tuning rig, not the game. The repo is a complete plan for a 30-month, ~$11.9M production,
plus the machine-readable data and reference implementations that plan depends on, plus a browser
rig for tuning the blade–ice model before it is written in C++.

Owner: [@9x25dillon](https://github.com/9x25dillon). Public repo. Dual-licensed — see
[README](README.md#licensing), and **do not relicense without asking**: the split (docs
CC BY-NC-ND, code/data Apache-2.0) is deliberate and reasoned.

---

## 2 · Current state

| | |
| --- | --- |
| Documents | 8 in `docs/`, all complete |
| Data files | 12 in `data/` — 5 CSV, 6 JSON, 1 README |
| Reference code | 6 files in `src/reference/` — specifications-as-code, do not compile |
| Engineering material | `big_reffg.txt` — 3,711 lines, three concatenated documents, **has known defects, see §2.2** |
| Native foundation | `tools/ice-lab/native/` — C++17 serialization, CRC32 and deterministic math checked against an oracle pinned at replay `/5`; no native solver yet (PR #4) |
| Implementation | `tools/ice-lab/` (branch `ue-replay-01-foundation`) — 408 tests, zero dependencies, engine-independent replay, camera, three courses with ghosts (the Slalom now scores a designed curve too), jumps and the moves (both off by default) including the bracket, a rhythm layer with real music, career/choreography with a spin-level and step-sequence bonus, a standalone game (`game/`) with rink-boundary walls, and a Godot presentation (`games/ice-run-godot/`) with a second selectable skater |
| Rendered pages | 5, published as Artifacts **and** mirrored in `docs/web/` |
| Decisions | **4 of 6 closed.** D1 and D5 remain |

### The two open decisions — and they are one conversation

**D1 (budget/team)** and **D5 (disciplines at launch)** are coupled. The plan totals **$11.9M of
development**; D1's envelope quotes **$18–25M**. If that envelope is development-only, there is
~$6M of headroom, and the honest place to spend it is the second discipline D5 asks about. If it
includes marketing and year-one liveops, the plan fits as written. **Resolve them together, with
whoever holds the money in the room.**

### Decisions closed 2026-09-03 (previous session)

| | Decision | Note |
| --- | --- | --- |
| **D2** | Unreal Engine 5.4+ | Cancelled the pre-production bake-off; W1–2 became a single-engine validation spike |
| **D3** | Single-player first | Default; async ghosts + warm-up lobby at launch, pairs year one |
| **D4** | Adaptive tier routing | *Not* either option the register offered — The Patch recommends a tier from its own tracing score |
| **D6** | No athlete licensing | Closed at first writing |

**D2 is closed and stays closed.** It was raised again on 2026-09-09 as "should we build a game
engine" and the answer was no, for the reason the register itself gives: it was the only item with
a hard date, and every week it stayed open cost two engineers half their throughput. If a session
is asked to build an engine, say what D2 says and offer the Ice Lab route instead.

---

## 2.1 · `tools/ice-lab/` — what it is and how to run it

A 120 Hz, deterministic, **inertial** implementation of the blade–ice model with every constant on
a slider. It is EDGE-019's Ice Lab, built early and cheap, so `KoLdSimCore` can be written in C++ as
transcription rather than as discovery. **It is not the game and it is not an engine.**

```sh
cd tools/ice-lab
node --test test/*.test.ts     # 408 pass, ~30 s
node app/serve.mjs             # http://localhost:8123/
```

**Zero dependencies, and keep it that way.** Node 26 strips TypeScript natively and exposes the
stripper as an API (`node:module` → `stripTypeScriptTypes`), which is the entire build step. The
price is **erasable syntax only** — no `enum`, no `namespace`, no constructor parameter properties.
`test/boundary.test.ts` enforces that, and also enforces the rule the UE5 port depends on: `sim/`
never imports `app/`, never touches the DOM, a clock, or `Math.random`.

`tsconfig.json` exists for editors and an optional `tsc --noEmit`. It is the only thing in the rig
that wants anything installed. Tests and build do not need it. **On this machine nothing provides
`tsc`** — see §5 item 13 for the working recipe.

**Falling and getting up (added 2026-09-09, fifth session).** A fallen skater slides until the
tester does something. A *fresh* press of A / Space stands them up where they fell, at rest; the
press is consumed (not a stroke) and a button held through the fall does not count (new state field
`pushHeld`). This makes the plan's time-to-retry — "seconds from fall to next input" — the same
event as the sim's response. `downSeconds` is time on the ice until stand-up or reset. A stroke
also floors the knee at the neutral stance 0.35, because a straight leg cannot push and a pad with
RT released previously had zero push force. Scheme C gained the rocker on both sticks' fore/aft
(mean of the two, with A's sideways-bleed relief). **Schemes A and B were deliberately left as they
were**: a draft that gave both a right-stick weight/rocker channel was reverted, because A is under
test as §2.1 wrote it (three channels, not five) and a blade channel on B hands it a piece of A and
narrows the contrast the down-select measures. The commit message of `fb87c52` has the reasoning.

**Jumps, over the plan's refusal (added 2026-09-10, sixth session).** pre-production-plan §1 refuses
jumps, rotation, scoring and named elements in the prototype, admitting only a rotation-free hop from
W9. The operator was shown that and chose to have full jumps in the rig anyway, alongside the hop,
headless-testable scoring, the Edge Ribbon and the edge tone. **That is their decision; do not reopen
it, and do not loosen the containment either**: `jumpMode` is 0 in every preset, `?playtest=1` forces
it to 0, so no M2 or gate session can contain a jump. `sim/jump.ts` is `JumpResolver.cpp` (no jump
button — release the knee; ballistics fixed at takeoff; carriage the one air lever); `sim/score.ts` is
the jump half of `ScoreCalculator.cs`, reading the CSVs, with the data winning where the two disagree.
Replay contract is now `ice-lab-f64/3`; the fixture was re-recorded from its own inputs after its
kinematics were proven identical to `/2` (§5 item 14's procedure).

**Seeing the controls.** The operator asked for "something to visualize while running the engine" to
learn what each button does. The skater figure is drawn from state (feet on the solver's contacts,
arms from the save, tuck in the air), and the input panel shows hardware beside the mapped
`SkatingInput`. The panel is developer-only (off in playtest); the figure is not.

**The moves, over the same refusal (added 2026-09-13, ninth session).** Crossovers, the three-turn and
mohawk, twizzles, spins, the Ina Bauer, and jumps reached from those entries — the operator's list, in
`sim/moves.ts` and the solver, behind `movesMode` with the same containment as jumps (0 in every
preset, forced 0 in playtest, inert at 0). Two ideas hold it together. **A cusp is a change of frame,
not of physics**: lean and tilt are measured toward the heading's left, so when a turn reverses the
heading they all change sign with the body unchanged, and the edge code flips on the same tick
(`flipFrame`, counted in `s.flips`, which a control scheme reads to keep a held stick on its side of
the ice). **The moves are measured against the project's own data** — `motion-primitives.json` for
costs, `spin-positions.json` for inertia, `entry-templates.json` for entry speeds — with every
calibrated constant labelled a balance lever. The README's "The moves" section has all of it.

Read [`tools/ice-lab/README.md`](tools/ice-lab/README.md) before changing any of it.

### What the rig found

Eight things, each recorded as a test rather than prose, so they fail loudly if reverted.
**Findings 4, 5, 6 and 7 have been fixed in the rig** (2026-09-09); the defects stay reproducible
because `spec` still carries every one of them.

1. **`big_reffg.txt` contains both readings of the handedness.** One half correctly calls `Up × t`
   "the skater's left"; the other calls the identical expression "Right" and derives every edge
   code from it. Mirror images — one names an RFO where the other names an RFI. A takeoff-edge
   validator on the wrong one fails every jump in `data/jump-definitions.csv` while looking
   self-consistent. Settled in `sim/math.ts`; checked against every CSV row in
   `test/classify.test.ts`.
2. **The internal balance authority has its sign backwards.** A positive balance error needs a
   *positive* `a_int` to arrest it. As specified, arms and free leg push the skater further over.
3. **The two-blade lateral solve cannot pass its own acceptance test.** Full body mass per blade,
   applied Gauss-Seidel, so the first blade absorbs everything. Fixed — which surfaces a model
   fact: with capacity linear in load, both blades sit at *identical* demand ratios, so the weight
   split can never decide which lets go without sublinear capacity, which is not in the model.
4. **The specified gains cannot enter a deep edge from upright.** Holding 20° at 4 m/s is stable;
   reaching it is not. Instrumenting which clamp binds separates two different failures: at `spec`
   the **angulation limit** binds for 256 of 317 ticks (a controller limit), at `responsive` it is
   **maxTilt** for 215 of 314 (a physical one). Below ~5 m/s gains move the limit; above it only
   blade geometry does — at 6 m/s tripling the authority damping is worth 1°, sharpening the rocker
   to 1.6 m is worth 7°. Measured, deepest lean reachable from upright:

   | | 3 m/s | 4 m/s | 6 m/s |
   |---|---|---|---|
   | `spec` (Kd 8, angulation 20°, no rate term) | 4° | **11°** | 32° |
   | `spec` + finding 5's rate term, nothing else | 9° | **19°** | 43° |
   | `responsive` (Kd 16, angulation 40°, fixed) | 13° | **25°** | 44° |
   | `assisted` | 13° | **25°** | 44° |

   These are leans **reached**, not merely survived: each preset stays up about 2° deeper than it
   tracks. Quote the tracked number — the other one flatters.

   Two things it is not, both checked rather than assumed: **not an entry transient** (slewing the
   stick at 360 / 180 / 90 / 45 °/s changes the limit by nothing), and **partly the measurement
   horizon** — six seconds with no propulsion means speed decays, and at twenty seconds every
   parameter set collapses to 4–7° for no reason but lost speed. Measure the loop with losses off
   or with a stroke in the sequence.

   The table also carries the best thing the model says about the game: **speed buys depth, as v²**.
   With the controller fixed, `tan φ` tracks κ = g tan φ / v² to three digits — 1.777 measured
   against 1.778 predicted from 3 to 4 m/s.
5. **An assist tier that raises recovery authority makes balance worse.** `internalMax` 1.5 → 2.5
   falls at tick 77 instead of 617, and 2.0 outlasts both — a proportional gain with no damping.
   **Fixed** by `internalRateGain`, the missing rate half of the PD: arms and a free leg are swung,
   and what they are swung against is lean *rate*. 1.5, 2.5 and 3.0 now all skate the reference
   sequence. `validate()` rejects `internalMax > 2` with no rate term under it, so the mistake
   cannot reach a UE5 tuning asset. Cost, stated honestly: a 20° edge settles in 2.9 s under
   `assisted` rather than 1.7 s, because damping is what is being bought.
6. **A save is scored as a fall.** `balanceError` measures lean against the equilibrium the *edge
   alone* supports, and the balance-timeout test credits none of the internal authority — so using
   the arms and free leg **is** the fall condition, and the more authority a tier grants the sooner
   it fires. At `internalMax` 2.5 the reference sequence is declared over at tick 77, at **2.6° of
   lean**, upright, at 4 m/s, mid-recovery. **Fixed** by `fallAuthorityCredit` (0 in `spec`, 1 in
   the presets). It buys no depth at all — the entry envelope with credit alone is identical to
   `spec` — and it does not make the skater unfallable: an unholdable lean still goes down by
   `LEAN EXCEEDED`.
7. **The internal authority has no range limit, and will hold a lean forever.** Found by building
   control scheme B, which could not steer and should have been able to. A skater asked for a 20°
   edge settled at 13°, blade flat, going straight, indefinitely — arms and centre of pressure
   holding a lean the ice was not carrying, while the balance loop steered the other way trying to
   reach the edge it had been asked for. The arithmetic is exact: authority 2.74 m/s² against
   `g·tan(13°)` = 2.26 m/s², so it holds forever. **Fixed** by `internalWashout`, a high-pass on
   the arms term — what is held drains away, what changes still gets through — with the
   centre-of-pressure term deliberately exempt, because a 24 cm stance really can hold ~7°
   indefinitely and that is what standing still is. **This was invisible until finding 6 was
   fixed**: while the fall test credited none of the authority, these states timed out and fell, so
   the model looked honest for the wrong reason. Fixing one thing is how you find the next.
8. **Four mechanisms the package lacks**: variable effective rocker along the blade; lateral
   resistance on a flat blade; a rate-limited knee; and rotating rather than projecting velocity
   under the constraint.

**`DEFAULT_PARAMS` stays faithful to the spec so the defects remain measurable.** Working values
live in `PRESETS.responsive`. Do not "fix" the defaults — that hides the finding. The corollary,
which the second session had to obey twice: **a new parameter's default must reproduce the old
behaviour exactly.** `internalRateGain` and `fallAuthorityCredit` are both 0 in `spec`, so every
previously recorded number still measures the same thing, and both tests that broke when the
presets were fixed were rewritten around the *measured* replacement rather than loosened.

---

## 2.3 · Publishing it, and collecting what it measures

Two pieces, because a static host cannot collect anything and a collector should
not be the front door for contributors.

| | |
| --- | --- |
| **Public build** | `.github/workflows/pages.yml` — tests, builds, deploys to GitHub Pages. The tests gate the deploy. |
| **Collection** | `tools/ice-lab/app/collect.mjs` — serves the rig *and* takes `POST /api/session` into a JSONL file. Zero dependencies, one file, binds loopback. |
| **Deployment** | `tools/ice-lab/deploy/` — hardened systemd unit, a Caddyfile that strips client addresses from the access log, and a twenty-minute runbook. |
| **Contributors** | `CONTRIBUTING.md` and three issue templates. The docs licence needs the grant in it — see below. |

**An Artifact with a database cannot be used for this.** The `db` capability
makes an artifact organization-internal and *unshareable publicly*: every reader
and writer must be a signed-in member of the owner's org. That rules it out for
handing a link to a nephew, which is what it was being considered for. A plain
box with 180 lines of Node does the job with no accounts at all.

**The collector trusts nothing it receives.** Cards are rebuilt field by field
from a fixed schema — numbers coerced and rounded, strings stripped to a safe
alphabet, unknown fields dropped, bodies over 64 KB refused. No accounts, no
cookies, no analytics, **no IP logging**: the payload is numbers about a
simulation and nothing about a person, which is both the privacy position and
what makes two testers' sessions comparable.

**The docs licence blocks doc contributions and always did.** `docs/` is CC
BY-NC-**ND**, and a pull request editing a document is a derivative work.
`CONTRIBUTING.md` now carries a contributor grant (DCO sign-off plus a licence
back to the project for `docs/` changes) so the door is open without touching
the split, which stays as reasoned. It is written to be readable rather than
airtight; if a contribution ever matters commercially, both sides should want a
lawyer to look at it.

---

## 2.2 · `big_reffg.txt` — read this before trusting it

Committed unedited on 2026-09-09 (`1a0fa55`) because it is the source the Ice Lab was built against.
It is **three separate documents concatenated**, not one:

| line | document |
| --- | --- |
| 1 | Edgework Subsystem: Engineering Package v0.1 — `KoldSim`, 48 B blade, 16 B input, balance external |
| 636 | First 50 Engineering Tasks, KOLD-001..050 |
| 2502 | Edgework Build Package, EDGE-000..019 — `KoLdSimCore`, 80 B blade, 8 B input, balance integrated |

Known defects:

- **The first and third are incompatible designs sharing a name** — different modules, struct sizes
  and layouts, input quantization, and disagreeing on whether the solver owns balance or reports it.
- **They disagree on handedness** (see §2.1).
- **The 50-task list contradicts itself**: KOLD-012/013 give 48 B blade + 56 B body while KOLD-014
  asks for 256 B total (the sum is 152), and KOLD-015 says 16 B input where the third package says 8.
- **§6.2's classifier is truncated.** The `.cpp` stops mid-function at line 630, `if (F.bLobeOpen)`,
  and line 631 is prose from the second document. `FKoldEdgeClassifier::Update` has no body.
- **Its "repository unavailable, PENDING AUDIT" premise is stale.** `data/jump-definitions.csv`,
  `data/assist-tiers.json`, `data/step-features.json` and `src/reference/` answer most of its open
  questions directly, and D2 closed the engine question on 2026-09-03.
- **Where its ASSUMPTION values disagree with the design bible and `src/reference/SkateSolver.cpp`,
  the bible wins**: rocker 2.05 not 2.2/2.4, μ_skid 0.35 not 0.03, max lean 1.13 not 1.05/0.96.

---

## 3 · Conventions that hold the set together

Break these and the repo stops being coherent. They are not arbitrary.

### 3.1 Markdown is the source of truth; HTML is the rendering

Every phase and system document exists twice: `docs/*.md` (reviewable, diffable, PR-commentable)
and `docs/web/*.html` (the published Artifact). **Edit the markdown first, then mirror.** They
will drift if you do it the other way round.

### 3.2 Scoring is data, never code

The ISU revises its Scale of Values most seasons. Everything scoring-related lives in `data/` so a
rules change is a data patch shipped in days. **Never inline a base value, a threshold, or a level
feature into code.** See [`data/README.md`](data/README.md).

### 3.3 Every threshold is a balance lever, not a rule

Where the ISU says *"clear increase of speed"*, a human specialist applies judgement and a game
must pick a number. We picked 1.30. **Label these as design decisions wherever they surface** —
`data/spin-features.json` and `step-features.json` both carry this warning in their headers, and
`verified_against_isu: false` is set honestly. Do not quietly flip that flag.

### 3.4 Gate criteria are pre-commitments

Every phase gate has thresholds **signed before the data exists** — that is what stops a gate
becoming theatre. If you add a gate, add its sign-off date too.

### 3.5 Corrections are recorded, not silently applied

Three places the later documents deliberately correct the bible. Preserve these notes:

| Correction | Where |
| --- | --- |
| The Composer searches a **motion-primitive lattice in physics space**, not the motion-matching database | [composer-solver.md §2](docs/composer-solver.md#2--why-this-is-hard) |
| Mocap blocks 1 and 2 moved to the **vertical slice**; production gets a third, smaller block | [production-plan.md §6](docs/production-plan.md#6--mocap-block-3) |
| `spin-step-values.csv` gained the missing **level B** rows | commit `9de53a4` |

---

## 4 · Published Artifacts

Five live pages. **URLs are stable — always update in place, never republish as new.**

| Page | Artifact URL | Repo mirror |
| --- | --- | --- |
| Design bible | `claude.ai/code/artifact/58f6234d-6ece-4f55-8fc5-2b7a7ce86da9` | `docs/web/index.html` |
| Pre-production | `claude.ai/code/artifact/531a5952-fcfd-44bf-966a-ae31ce3562c9` | `docs/web/pre-production.html` |
| Vertical slice | `claude.ai/code/artifact/dde9b2ad-4d31-412f-a15e-6edbb6cc305a` | `docs/web/vertical-slice.html` |
| Production | `claude.ai/code/artifact/6a36f22c-3ed6-4439-828b-cd14759ebaca` | `docs/web/production.html` |
| Beta | `claude.ai/code/artifact/bdd4ebbf-b24e-4b31-bcf3-9afdce6a4e53` | `docs/web/beta.html` |

### To update one from a new session

1. Edit the markdown in `docs/`.
2. Edit the mirror in `docs/web/`.
3. Publish **passing the `url` parameter** from the table above. Without it you create a *second*
   artifact instead of updating the existing one.

The mirrors in `docs/web/` exist precisely so a new session never needs the previous session's
scratchpad — which does not survive.

### Shared visual identity

All five pages use one stylesheet: Bodoni Moda (display) × IBM Plex Sans (body) × IBM Plex Mono
(data), cool grey-white ground, arena-amber accent `#9c6b12` / `#e2a94e`, steel-teal `#2c6773` for
data, double-hairline section rules echoing a blade tracing. **The bible's stylesheet is the
richest** (it has the syntax-highlighting classes); the four plans share a slightly reduced one.
If you add a sixth page, copy the head from `docs/web/production.html`.

---

## 5 · Things that will trip you up

**Documents and shell**

1. **The shell is `fish`.** Heredocs (`cat > f <<'EOF'` and `python3 - <<'PY'`) work fine through
   the Bash tool and were used throughout both sessions. What differs is **globbing**: an unmatched
   glob is a hard error, not a pass-through — `ls LICENSE*` fails with *"no matches found"* rather
   than printing nothing. Quote globs you are not certain match.

2. **Do not write HTML entities into source files.** `src/reference/SpinResolver.cpp` was written
   with `&amp;` and `&lt;` and needed an unescape pass. If you have just been authoring an HTML
   page, consciously switch modes before writing a `.cpp`.

3. **Exact-match edits fail across the md/HTML pair.** The same sentence is line-wrapped
   differently — e.g. `None, no HUD` (markdown) vs `None, no HUD at all` (HTML). **Grep the target
   file for the actual string before constructing the edit.**

**The Ice Lab**

4. **Erasable syntax only.** An `enum`, a `namespace`, or a constructor parameter property compiles
   under an IDE and then fails at `node app/build.mjs`. `test/boundary.test.ts` catches all three —
   run the tests before assuming a change is fine.

5. **A skater with no propulsion always falls, and it looks like a controller bug.** Speed decays
   through friction and drag, the maximum holdable lean falls as `κ = g·tan φ / v²`, and eventually
   any commanded lean is unholdable. Roughly five seconds from 5 m/s. **Before debugging the balance
   loop, check the speed at the moment of the fall** — an afternoon went into gain sweeps that a
   single speed trace would have ended. Test sequences must either stroke (`push: true` every ~90
   ticks) or disable losses.

   **The same trap contaminates measurements, not just debugging.** The entry-envelope numbers are
   partly a function of how long the run is: at six seconds `spec` reaches 11° at 4 m/s, at twenty
   seconds it reaches 4°, and the difference is entirely lost speed. Any number quoted about the
   balance loop needs its horizon quoted with it.

6. **Measure before asserting.** Several tests were written with guessed bounds and had to be
   loosened to the measured value. Print the number first, then write the assertion around it —
   otherwise a passing test is only recording the guess that happened to be generous enough.

7. **Piping a long background command to `tail` hides it.** `npm test | tail` in the background
   produces an empty output file until the command exits, which reads exactly like a hang. Give
   long runs a generous timeout and read the raw output file, not a filtered tail.

8. **Trace once before sweeping anything.** Both of this session's findings came out of two
   diagnostics — print the loop's own variables each tick, then print *which clamp is binding* each
   tick. That took twenty minutes and pointed straight at the mechanism; the parameter sweeps
   afterwards only confirmed sizes. A sweep tells you a number moved. A trace tells you why, and
   the why is what turns out to be wrong.

9. **A fixed defect is how you find the next one.** Finding 7 was invisible while finding 6 stood:
   the states where the arms hold a lean forever used to trip the balance timeout and fall over, so
   the model looked honest for the wrong reason. After every fix, re-measure the things the fix was
   not about — the entry tables moved by 1–3° and nothing in the change touched them.

10. **A "control" parameter set built by subtracting fixes from a preset will rot.** Two tests
    constructed "as the package specifies it" as `{...PRESETS.responsive, someFix: 0}`, so the next
    fix leaked straight into the control case and both tests failed for the wrong reason. Build
    control cases by ADDING to `spec`, which is the baseline by definition.

11. **`python3 - <<PY` patches that do not assert their match will lie to you.** A `.replace()`
    whose pattern is absent is a silent no-op, so a whole import line was never added, the build
    "succeeded" (type stripping checks nothing), and the page died with `ReferenceError` in a
    browser. Every patch in this session that asserted `old in s` was fine; the two that did not
    were the two that broke. **Assert the match, always.**

12. **`sim/` has no type checker in this environment.** `tsc` is not installed and the build only
   strips types, so a slider naming a parameter that does not exist, or a state field never
   initialised, reaches a browser silently. `test/boundary.test.ts` catches the syntax rules; for
   `app/`, `test/app-loads.test.ts` imports every module against a DOM stub **and constructs the
   lab**, which is the part that matters: importing a module only proves its imports resolve, not
   that the code runs. A missing binding used in a class field linked cleanly and threw in the
   browser.

13. **The npx cache holds a decoy `tsc`.** `npx tsc` prints "This is not the tsc command you are
   looking for" and the only real TypeScript on disk is 5.5.4 in Trash, too old for
   `erasableSyntaxOnly`. Working recipe: `npm install typescript @types/node` in a scratch dir,
   then from `tools/ice-lab`: `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots
   <scratch>/node_modules/@types`. TS 7.0.2 checked the tree clean on 2026-09-09.

14. **The replay digest hashes the whole `SkaterState`.** Adding a field, even one with no effect
   on kinematics, moves every digest and fails `test/replay.test.ts` on tick 1. The rule in
   `sim/replay.ts` is: bump `REPLAY_SOLVER`, re-run the fixture from its own recorded inputs, and
   prove whether kinematics changed by replaying through the previous solver
   (`git archive origin/main tools/ice-lab/sim | tar -x -C /tmp/oldsim`, then compare final
   state). Never regenerate just to make CI pass. `/1 → /2` was done this way for `pushHeld`.

15. **Fetch before you push.** The first push of `fb87c52` was rejected because PR #3 had landed
   on `main` mid-session. A clean rebase followed, but the fixture test then failed for the reason
   in item 14. `git fetch && git log HEAD..origin/main` before committing would have surfaced it.

16. **A leading `=` in a shell argument is a command lookup.** `echo =====X` fails with
   "=====X not found". Quote separators or start them with another character.

17. **The balance overlay was mirrored until 2026-09-10.** It drew the COM at
   `base − perpLeft·L·sin(lean)`, outside every turn. Any screenshot or play note about "the purple
   line" from before `7f113ca` described the mirror image. `pendulum()` in `app/draw.ts` now reads
   the COM off `pos`, and `test/draw.test.ts` holds it there.

18. **The Edge Ribbon and edge tone are on in playtest**, because the plan builds them as channels
   under test. Sessions recorded before 2026-09-10 had neither, so they are a different condition —
   do not pool them with later M2 data.

19. **A jump's landing inherits the `EdgeChanged` caveat.** Contact returns as NONE→edge, like a
   stand-up. Irrelevant while jumps are off in playtest; fix it with the other one if that changes.

20. **The canvas stub in `test/app-loads.test.ts` has no `measureText`** and returns `undefined` for
   every call. Anything in `app/` that reads a return value from the 2D context throws there first.

21. **A replay recorded in one JS engine may not verify in another** — see §0 item 2. A divergence
   on a Firefox clip is not evidence of a solver bug until it has been replayed in Firefox.

22. **A pasted clip gets a newline every 10,000 characters.** `replay-4` arrived that way and failed
   `JSON.parse`. The recorder never writes newlines, so stripping every `\n` restores it, and the
   per-tick digests prove the repair was lossless. Repair a copy in the scratchpad; the operator's
   file stays as they left it.

23. **`schema` on a session card is a format version, not a session counter.** One card arrived
   hand-edited to `edgework-session/2`. The collector rebuilds cards and treats the field as the
   format; number sessions in the filename.

24. **The Bash tool's shell is zsh here, not fish or bash.** An unquoted `$var` does not word-split:
   `for cfg in "0 5 0.25"; do node x.ts $cfg` passes one argument and every number reads as NaN — a
   run of all-zero traces that looks like a physics result. Use `${=cfg}`.

25. **After a turn, lean and tilt have the opposite sign for the same body.** Anything reading
   `s.lean` across a turn must follow `s.flips`. A test driver that does not mirror its stick at a
   flip leans the skater out of the circle it was on; every moves test does the mirror by hand, the
   way `latchTurns` does for a player.

26. **Stroking and crossovers top out near 8.7 m/s**, where the pushing blade — at its 20° push edge,
   carving nothing — reports its own skid and friction. Pre-existing, in `spec` too, and a plausible
   ceiling; do not mistake it for drag.

27. **Enter an Ina Bauer with the lean already in.** Pressed while the balance loop is still rolling a
   lean in (the blade first tilts the other way), it starts on inside edges, correctly for the tilt it
   found. Measured runs lean first.

28. **Jump outcomes with the moves on depend on approach speed**, so a jump test copied from
   `test/jump.test.ts` into moves mode comes out lower unless it approaches at the jump's entry speed
   (`ENTRY_SPEED`, from `data/entry-templates.json`). The turns test's salchow had to move from 6.3
   to 7.0 m/s for exactly this reason.

29. **A new `Params` or `SkatingInput` field is not done until three places agree, plus a fixture.**
   `sim/replay.ts`'s `parseReplay` hand-enumerates every allowed key for both, twice over (once as the
   required-fields list, once as the type-checked subset) — separately from the interface in
   `sim/types.ts`/`sim/params.ts` and separately from `DEFAULT_PARAMS`/`NEUTRAL_INPUT`. Miss the
   `replay.ts` list and the *old, already-committed* fixture starts failing with "unknown field" or
   "missing field" on a field that was never touched. Bump `REPLAY_SOLVER` and re-record the fixture
   from its own inputs every time (item 14), for `SkatingInput` changes exactly as much as for `Params`.

30. **State the sign of a dot product in a comment before writing the conditional that uses it.** A
   wall bounce's velocity-dot-outward-normal is positive when *still heading out* and negative when
   *already heading back in* — "into the wall" is the intuitive name for the first case but describes
   the second just as easily in English, and the collision code was written backwards on the first
   pass. A test with a skater already leaving the boundary caught it before anything shipped; it would
   not have been obvious from playtesting alone, since a wrong sign here still looks like *some*
   physical response, just the opposite one.

31. **A new "check near zero, then continue" state can collide with an existing "too slow, exit"
   condition — check the interaction, not just the new state's own floor.** The spin reversal's first
   attempt set `spinReverseFloor` (an angular-momentum floor to flip at) using a plausible-looking
   number against typical entry angular momentum, never checking it against `spinMinOmega` — the
   *pre-existing* "the spin is too slow, check out" exit, which reads `omega = angMomentum / inertia`,
   a DIFFERENT quantity that varies with position (upright vs. camel is a ~9× inertia swing). The
   reversal's own floor was comfortably above zero but still corresponded to an omega already below
   `spinMinOmega` at high inertia, so the pre-existing exit fired first and the spin just ended instead
   of reversing — invisible until a driven probe script actually printed `angMomentum`/`omega` per tick
   and showed the exit firing before the flip. Fixed by exempting the pre-existing exit for exactly as
   long as an active check is in progress, not by re-guessing the floor. The general lesson: before
   picking a threshold for new behaviour that shares a state machine with existing behaviour, trace
   what the OLD conditions evaluate to at the new state's own boundary — a probe script first, a
   constant second, the same order `sim/moves.ts`'s existing findings 4–7 already established for a
   reason.

32. **`app/build.mjs`'s data-file copy list is curated by hand and does not notice a new `fetch()`.**
   `game/main.ts` fetching a new `data/*.json` file works perfectly in every test that imports the
   module (which never fetches anything) and fails silently — a plain 404, no thrown error anywhere —
   in the actual served build, which is the only thing a player or a Playwright check against
   `localhost:8123` ever sees. Caught only because a live browser check was run against the built,
   served output rather than trusted from the test suite being green. `test/app-loads.test.ts` now
   scans `game/main.ts`'s own `fetch("../data/...")` calls against `build.mjs`'s list directly, so this
   specific gap cannot recur silently — but the general shape (a curated file list next to a dynamic
   fetch) can recur elsewhere; check for it deliberately when adding a new fetched asset anywhere.

---

## 6 · Where to go next

In descending order of value:

1. **Close D1 and D5 together.** Everything else is downstream of the money. Unchanged.
2. ~~**Fix what the Ice Lab found, in the rig, before any C++ is written.**~~ **Done**, 2026-09-09
   (second session): findings 4, 5 and 6 are fixed, `spec` still carries the defects, and every
   number is a test. What is left of this item is the part a keyboard cannot answer — whether the
   fixed loop *feels* like skating, which is item 3.
3. **Take the rig to a skater.** It renders edges, carve circles, force vectors, the equilibrium
   lean and a live tracing, and exports per-tick CSV. The question the whole project is downstream
   of — §7 below — is now answerable by someone who skates, on a laptop, in an afternoon. Record
   the session in `docs/tuning/` and export the parameter set with the panel's **params.json**
   button, which emits only what differs from `spec`.

   **The rig is now set up for the plan's own M2, not for the kill gate.** Read
   [pre-production-plan.md §3, §6 and §7](docs/pre-production-plan.md) before running anyone:

   - **All three schemes exist** — A *Lean & Load* (bible §2.1), B *Steer & Load*, C *Two-Foot* —
     cycled with **M** or **Back**, labelled A/B/C on screen and nowhere identified, because §7
     requires the labels be blind to the testers *and* the observers.
   - **`?playtest=1`** hides the sliders, the preset name and the exports. A tester gets a rink and
     a letter.
   - **The session export** is the five §6 metrics the rig can compute, under that document's
     definitions, plus the scheme and the parameters. No names, no accounts, no free text.
   - **Two pre-existing metric caveats to settle before gate data exists** (found 2026-09-09,
     fifth, left alone on purpose): B's LB/RB pick the foot, and for a given turn direction foot
     choice *is* inside/outside edge choice, so B's stated trade is partly leaky; and
     `EdgeChanged` counts the NONE→edge transitions after every reset and stand-up (~2 per fall).
     Both change what a number means, neither is hard to fix.
   - **W8's M2 is the milestone this serves**: *"eight team members plus eight friendly externals,
     blind A/B/C, ranked. Soft gate: down-select 3 → 2."* Friends and family are friendly
     externals, and their data legitimately chooses a scheme. It can **never** feed the W16 kill
     gate, which excludes *"anyone who knows the team"* — and W13's protocol pilot exists precisely
     so a first run debugs the protocol rather than the game. Its data is discarded by design.

   **Start them on `responsive`, not `spec`.** `spec` cannot enter an edge deeper than 11° at
   stroking pace, which is not a fair test of anything. The two questions worth putting to a skater
   first, because the rig now has an answer to check against: does depth arriving with speed feel
   like a reward or like a lockout, and is 2.9 s to settle a 20° edge under `assisted` help or
   sludge?
4. **Then port `sim/` to `KoLdSimCore`.** It is written to be transcribed: SI throughout, plain
   data, no allocation in `step`, every transcendental through one module, truncating checksums,
   and an edge code whose spelling already matches `data/jump-definitions.csv`. **Started 2026-09-13**
   as UE-REPLAY-01 (`tools/ice-lab/native/`, PR #4): the wire types, serialization and math are
   checked against a pinned `/5` oracle; the solver transcription is next (§0).
5. **Verify the ISU data.** `spin-features.json`, `step-features.json` and `scale-of-values.csv`
   are faithful models, not transcriptions, and all carry `verified_against_isu: false`.
6. **Build the protocol validation corpus** — 50 published elements reconstructed against the level
   detector, target ≥85% agreement. Needs Composer v0, so it belongs to the vertical slice.

### Not in the rig, deliberately

Rockers, counters and a genuine choctaw (bracket exists as of 2026-09-14; see §0 for why a
foot-changing choctaw needs a different mechanism) — the two remaining ISU "difficult" turns and the
two remaining "step" types both `sim/spinLevel.ts` and `sim/stepLevel.ts` (2026-09-17) are honestly
capped without; a combination spin's foot change (same date, same file, same reason); jump combinations
and sequences; a full Program Component Score wired into play (`sim/pcs.ts` exists, 2026-09-17, called
from nowhere yet); animation, networking. The stroke is the bible's semi-analytic push, not a leg model.
The profile layer
(2026-09-11) exists but nothing moves its stats yet. The moves (2026-09-13) and the bracket
(2026-09-14) exist, contained; see §0. A rhythm layer and rink-boundary collision (2026-09-14) exist
in `game/`, both game-layer and both deliberately outside what a replay verifies; see §0.

### Known gaps, all deliberate

Tracked at the foot of [open-decisions.md](docs/open-decisions.md): balance-model tuning constants
(**the Ice Lab is now the instrument for these** — they were "cannot be derived, they come from the
feel prototype"), crowd reaction propagation timing, career economy, and ice temperature as a
career variable.

---

## 7 · The one thing that matters most

Everything in this repo is downstream of a single unproven claim: **that analog lean plus analog
knee pressure is a good primary verb.** No shipped game has used it.

There is a real kill gate at pre-production week 16 — *"is carving fun with no jumps, no score and
no art?"* — with pre-committed thresholds, a decision-maker who is **not** the person who invented
the scheme, and the authority to stop the project.

If a future session is asked to soften that gate, move its thresholds after seeing data, or let the
creative lead vote on it — **push back.** Those three properties are the only reason the gate is
worth having.

---

## 8 · Session log

| date | what happened |
| --- | --- |
| 2026-09-17 (thirteenth, part seven) | Step sequences: `sim/stepLevel.ts` scores `data/step-features.json`'s variety ladder (honest ceiling grade 1/4, six observable types against a seven-type bar); a new `step` `ELEMENTS` entry in `game/career.ts`, Composer-authorable in Godot. Found and fixed: `step-features.json` 404'd in the real served build (`app/build.mjs`'s copy list never had it), a new regression test now guards it. `f82c400`. |
| 2026-09-17 (thirteenth, part six) | Program Component Score (`sim/pcs.ts`): the formula and `componentFactor` transcribed from `data/segment-rules.csv`, matched against `ScoreCalculator.cs`'s own comment; the physics-to-0..10 mapping openly authored, not transcribed, and the file says so. `IceGrid` gained `coverage()`. Standalone, tested, not yet wired into `career.ts`. `9b895d3`. |
| 2026-09-17 (thirteenth, part five) | Flow's "dead air between elements" — the clearest of its three remaining unmodelled bullets. Replay `/15`, the second bump this session checked directly against the fixture rather than assumed safe. `6c574c5`. |
| 2026-09-17 (thirteenth, part four) | Mid-spin direction reversal (`both_directions`): a held, opposite stick checks a spin's angular momentum to near zero, then flips and regenerates it — `spinLevel`'s honest ceiling moves from 2 to 3 of 10. Found and fixed a real interaction bug: the pre-existing "too slow" exit fired during the deliberate near-zero dip a check is. Replay `/14`. `832e62a`. |
| 2026-09-17 (thirteenth, part three) | Godot HUD gained a live spin-level readout (`bridge/engine.mjs` tracks it the way `game/main.ts` already did), beside the jump TES total the bridge had computed but never shown either. `0cb796e`. |
| 2026-09-17 (thirteenth, part two) | A second, selectable Godot skater, the Black Berserker, built on `build_skater.py`'s exact armature so `scripts/skater.gd` keeps posing it correctly; Settings → Skater. `a55e8f4`. |
| 2026-09-17 (thirteenth, part one) | The oldest open thread in this file, closed: the Slalom (`app/edges.ts`) scores a real designed curve (RMS off its own `guideY`), the same pattern the Figure Eight already proved. `sim/ice.ts`'s grid now also backs a persistent, uncapped whole-run trace, painted incrementally, gated on `iceGridMode`. `ef91292`. |
| 2026-09-17 (twelfth, part four) | The same gap, found and closed twice more: hype/flow reached career XP (averaged over a routine, same anti-farming gate as the medal), then a career routine's real jump TES and real spin level did too (15 XP/point, 40 XP/level). `c0ce9e8`, `fbb7eee`. |
| 2026-09-17 (twelfth, part three) | A spin's ISU level, for the first time (`sim/spinLevel.ts`) — 2 of the design bible's 10 features, the other 8 named individually as out of reach (pose data; a combination-spin or direction-reversal mechanic this rig does not have). Scored from `data/spin-features.json`, never hardcoded; wired into `game/main.ts`'s HUD. Verified live: a real held spin scored level 2. |
| 2026-09-17 (twelfth, part two) | Wired the ice grid, stamina, hype and flow into the actual game — `GAME_PARAMS` had never turned any of the four on. Found the same replay-determinism bug twice: `ReplayPlayer` and the Godot bridge's `engine.mjs` both never owned an ice grid, so a live-recorded session would have silently diverged on playback. New HUD: Wind/Legs, Hype, and an EDGE bar (not "flow" — a pre-existing, unrelated FLOW meter already existed). Verified live in headless Chromium via a borrowed Playwright install. `a9ecac4`. |
| 2026-09-17 (twelfth, part one) | Closed the entire tenth-session queue: the carve question (designed curve, chosen over a replay ghost — `sim/ice.ts`, replay `/10`), the career module's stat-balance link (`medalCap`/`statCap`), and stamina pools (Wind/Legs, replay `/11`), hype (replay `/12`, and a found-and-fixed bug: landings never reached music credit), and flow (bible §2.6, replay `/13`). `0bb3a53`, `68f6088`, `8686590`, `4635e92`. |
| 2026-09-15 (merge completion) | Found another session's `origin/main` → `ue-replay-01-foundation` merge mid-flight: all 13 conflicts hand-resolved in the working tree, nothing staged or committed. Verified the resolution rather than trusting it — the `test/rink.test.ts` rename, the `/9` replay renumbering, and the **U**-key split were all done correctly — fixed one real `tsc` bug it hadn't caught (a `strictEqual` "asserts" narrowing pinning `IceEffects.landing` to `null` across a later method call in `test/game-effects.test.ts`), regenerated `docs/fidelity-report.md` against the merged solver, and confirmed 322 + 8 tests, build, replay verify and the fidelity validator all clean before committing and pushing. `32f6d3c`. |
| 2026-09-15 (career/Godot resume) | Recovered another interrupted session's in-progress work on the operator's ask to continue and commit/push: a browser career mode (`game/career.ts` — events, choreography, medals, unlocks, XP, local saves) and `games/ice-run-godot/`, a playable Godot project whose Node pipe host runs the unchanged Ice Lab simulation, not yet a native physics port. 296 + 8 tests pass; both the editor and a Linux export completed a full career routine. Did not touch `main`. |
| 2026-09-14 (tenth) | The bracket, a redesigned skater, and rink walls: `sim/moves.ts` gained a same-foot, against-the-curve turn (replay `/8`); `game/scene.ts` gained a skirt and a ponytail; `game/rink.ts` gave the game a rounded-rectangle boundary to bounce off of or crash into, deliberately outside what a replay verifies. A "choctaw" was built and removed the same session when a test showed it wasn't one. 280 tests. `667b3a9`. |
| 2026-09-14 (tenth) | The rhythm layer and real music: `sim/music.ts` (replay `/7`) gives crossover pushes a beat window and turns/landings musical credit near an accent, off in every preset. Five of the operator's own tracks, found in a sibling worktree after some searching, now play for real via `game/audio/`; their tempo is `aubiotrack`'s estimate, halved for a likely octave error. Operator laid out a future stamina/flow/hype bridge to the career module, not built. 271 tests. `3b93279`. |
| 2026-09-14 (tenth) | Took over another session's in-progress game (`game/`): fixed a blank-page crash (missing DOM ids), cleaned up a doubled-up README draft, verified all three modes in headless Chromium. 262 tests. `23e675b`. |
| 2026-09-13 (parallel: UE-REPLAY-01) | A separate session, per its commit and `Kold_Feet_Summary_report.md`: the native replay verification foundation in `tools/ice-lab/native/` — C++ wire types and an oracle generated from Git objects pinned at `8d89af2` (`/5`), canonical serialization, CRC32 and deterministic math checked under GCC and Clang, CI wiring; no native solver, importer, runner or Unreal host. Merged as PR #4 (`a0ffada`); its report is on `ue-replay-01-foundation` (`effc0e5`). |
| 2026-09-13 (ninth, after the merge) | Merged the moves into `main` and pushed. Then finding 9 on the operator's word: the two-footed stance was proportional-only and aimed at the edge's balance, so it pulled against the lean controller and a 20° two-footed entry at 4 m/s fell. `copRateGain` and `copCommandShare`, 0 in `spec`, on in the presets; standing still bit-for-bit unchanged; replay `/6`; `test/stance.test.ts`. 249 tests. |
| 2026-09-13 (ninth) | The moves, on the operator's redirect toward backward skating and "back crossovers right into the jump": crossovers (`8da3a2a`), three-turn and mohawk (`aee316c`), twizzles (`a282cf7`), spins (`e10e6a7`), the Ina Bauer (`33986ce`), edge and toe jumps from their entries with the approach in the lift (`1e38ad0`). All behind `movesMode`, contained as jumps are; calibrated to `motion-primitives.json`, `spin-positions.json` and `entry-templates.json`. Found: the bible's crossover feet are backwards; a stroke on a curve always halved lateral support; two-footed lean commands lock at maxTilt at 4 m/s. Moves-off proven identical to `/4` over 22,184 ticks at every commit; replay `/5`. Driven in headless Chromium with a fake pad. 244 tests, tsc 7.0.2 clean. Branch `ice-lab-moves`, local, unpushed. |
| 2026-09-11 (eighth) | The skater profile layer, on the operator's direction toward a career game: `sim/profile.ts` — body, blade wear, five stats baked over a preset by `applyProfile`, one balance table and curve, XP pricing, `train`/`overall`/`tierOf`/`level`. Reference skater bakes bit-for-bit to every preset. Stamina listed and inert, recorded by a test. K cycles four samples in the lab. 194 tests, tsc 7.0.2 clean. `00ec259`. |
| 2026-09-11 (seventh) | Closed the sixth's three items: edge changes count choices not strokes (`f1cb2b4`), deterministic sin/cos/tan/atan2/asin/log in `sim/math.ts` with a boundary test banning raw `Math.*` transcendentals and `**` in `sim/` (`0b4636b`), session card `/2` with jumps and a clip digest (`87607af`). Then the game layers: debug camera and chase view, the Figure Eight with best-run ghosts, ghost races on any course, the edge course, the jump challenge from `data/`, and all of it on a pad. Every layer reads state and never writes it, tested; all unreachable in `?playtest=1`. |
| 2026-09-10 (sixth, after push) | Served the lab for the operator's first play sessions. Found the stroke-inflated edge-change metric (measured), the Firefox-vs-Node replay divergence (confirmed by verifying in headless Firefox), and a paste-wrapped clip (repaired losslessly in scratch). No code changed after `34fecd8`. |
| 2026-09-10 (sixth) | Reviewed and finished an uncommitted reskin: skater figure rebuilt on the solver's contacts, new input panel, mirrored COM overlay fixed (`7f113ca`). Then, on the operator's explicit choice over pre-production §1: `sim/jump.ts` (hop + full jumps, off by default and in playtest), `sim/score.ts` from `data/`, Edge Ribbon, edge tone, toe pick and carriage inputs. Replay `/3`, fixture re-recorded with kinematics proven identical. `e` given a numeric 0.80 factor in the calls CSV. 131 tests, tsc 7.0.2 clean. |
| 2026-09-09 (fifth) | Review of an unreviewed six-file draft against the kill-gate experiment, not just the tests. Kept and finished: fall recovery (fresh-press, in place, consumed), knee floor on strokes, C's shared rocker. Reverted: right-stick weight/rocker on A and B, for narrowing the A-vs-B contrast. Failing session test kept its assertions; only the stimulus changed. Replay contract bumped to `ice-lab-f64/2` for the new state field, fixture regenerated with kinematics proven identical. 105 tests. `fb87c52`, rebased onto PR #3. |
| 2026-09-10 | Replay milestone: exact mapped inputs, tuning snapshots, full-state/event digests, bounded five-minute capture, browser playback and a headless verifier. Pause/resume fixed. A 240-tick fixture and PR checks cover the regression contract. 97 tests pass locally on Node 24.19; browser visual QA was blocked by the environment's localhost access restriction. C++/UE5 remains the next port, not an implemented runtime. |
| 2026-09-02 → 03 | Specification completed. D2, D3, D4, D6 closed. Five Artifacts published and mirrored. |
| 2026-09-08 → 09 | `big_reffg.txt` reviewed and committed with its defects recorded. `tools/ice-lab/` built, 56 tests. Six defects found in the engineering package, each captured as a test. D2 re-raised and re-closed. Merged as PR #1 (`fbbf83c`). |
| 2026-09-09 (fourth) | Publishing and playtest prep. Pages workflow, a session collector, CONTRIBUTING with a contributor grant, and three issue templates. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 82 tests. |
| 2026-09-09 (fourth, part one) | Publishing and playtest prep. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 78 tests. |
| 2026-09-09 (third) | First play report on a pad. `app/pad.ts` had applied a per-axis deadzone while its own header described a radial one; fixed, plus fore/aft cross-talk suppression and a second control scheme on M / Back. The root URL served a blank rink and now redirects. 68 tests. |
| 2026-09-09 (second) | The controls. Findings 4 and 5 fixed and a seventh found: the fall test scores a save as a fall. Two new parameters, both defaulting to the spec's behaviour; `validate()` now rejects the assist tier written the wrong way. 64 tests. |

### How the 2026-09-09 session ran, for whoever runs the next one

(The ninth session's shape, 2026-09-13, is at the end of this section.)

The shape that worked: **assess first, recommend once, then build.** The session opened as a
review of `big_reffg.txt`, pivoted to "can this other repo become a game engine", and the useful
move was to answer the question that was asked, then say plainly that the obvious next step
collided with a closed decision — rather than either building the wrong thing or refusing.

The second session's shape was different and worth naming too: **trace, then measure, then
assert.** Every claim in §2.1 finding 4 and 6 came from printing the loop's own variables and the
binding clamp per tick, before any parameter was moved. Two hypotheses died that way in the first
twenty minutes — that the entry failure was a step-command transient (slewing the command changes
nothing) and that the tick-77 collapse was an oscillation (it is a detector firing at 2.6° of lean).
Both would have survived a parameter sweep, and both would have been fixed in the wrong place.

The fifth session's shape: **review a diff against the experiment it serves, not against the
suite.** Every file in the draft type-checked and 81 of 82 tests passed, and two of its three
ideas would still have damaged the month-four gate — by giving scheme A channels §2.1 never gave
it, and scheme B a channel that made it partly A. The brief that made this possible named the
authority order (bible and `data/` over README over `big_reffg.txt`), the invariant (the A/B/C
contrast and the §6 metric definitions), and what "done" meant, then asked for one uninterrupted
pass. The test that failed was protecting a stimulus assumption, not a metric; changing the
stimulus and keeping every assertion is the right move when the mechanic is sound.

The sixth session's shape: **finish what is on the table, then ask once where the plan pushes
back.** The draft was reviewed and committed before anything new began; the request to "continue
building any code in the reference bible" collided with pre-production §1, so the conflict was put
as one question with a recommendation, the operator chose all four options including the override,
and the override was built with containment rather than argued. Data analysis worked best as
*measure the claim in the sim, then report* — the edge-change finding is two numbers, not a theory.
What cost time: reading files the operator had not pointed at (Downloads) before confirming which
files were meant.

The eighth session's shape: **a roadmap stated as prose became one bounded layer.** The operator
listed six future systems in one message; the useful first move was to map each onto what
`params.ts` already had (mass, sharpness, strokePower existed; carve depth and a career state did
not) and recommend the cheapest layer that made every later item a matter of tuning numbers. The
operator picked it and added three asks in the same message; the layer was built, the asks were
written down verbatim (§0) and not started. One cost: the README's measured span was written from
the test's *bounds* before the numbers were run, and had to be corrected — measure, then write.

Two habits worth keeping:

- **Check the repo before believing a document about the repo.** `big_reffg.txt` declares its own
  repository access UNKNOWN and marks everything PENDING AUDIT. The data files were sitting right
  there and answered most of it in about five minutes.
- **When a spec and the project's own reference code disagree, say which wins and why, in the
  code.** `sim/params.ts` carries that table as a comment. Nobody has to re-derive it.

The ninth session's shape: **answer the claim before building the ask.** The operator's redirect came
with a physics claim — backward skating adds speed and angular momentum — and the useful first move
was four measurements (the takeoff's spin split, forward against backward, the stroke both ways, the
data's back pushes) that kept what was right, corrected what was not, and located the real gap (no way
to turn around). The operator then asked for seven things at once; they became six layers, each
measured against the project's own data before its test was written, each proven not to move the
moves-off solver, each committed before the next began. What cost time: a first crossover model that
shared the push's force correctly and still let the curve collapse, because the pushing leg's own arc
demand had never been carried — found by tracing the blade command through the first push rather than
by sweeping; and a browser check driven from the keyboard, whose full-deflection lean put the skater
down before any move could start, until a fake analog pad replaced it.

The second half's shape: **derive the steady state before sweeping the fix.** The two-footed lean went
through four stance variants in sweeps — a rate term (stopped the fall, left the lean 3° short), an aim
at the command (tracked, but stood still only by falling over), an aim scaled by what the edge can carry
(tracked and stood still), and a handover washout (worse). The equation that explained all four — the
stance sitting at its cap, and the command-aimed stance's standstill equilibrium at 27° — took a few
lines once written, and would have ruled out two variants without simulation. Two tests whose stimulus
leaned on the old wobble were re-timed around the new physics with their assertions kept, the fifth
session's rule. And the operator's review at the close turned up three prompting habits worth keeping
in mind for them: a stated goal for the day, a priority order with a definition of done and anything
off-limits (their pad's reset button moved without them asking), and fix-then-ship sequencing.

The tenth session's shape (2026-09-14): **guess, then verify, before the operator ever sees it — three
times running, in three unrelated systems.** A "choctaw" built by symmetry with the bracket, a skirt
built as a flat world-space shape, and a wall bounce's sign were each wrong on the first pass, in three
different ways (a physics claim that didn't hold up, a rendering approach that didn't survive a camera
angle, a dot-product sign that read backwards in English), and each was caught by this session's own
tests or its own screenshot before costing the operator anything. None of the three inefficiencies this
session names below are about that discipline — it held. They are about *scope*: a single message
carrying three substantial, unrelated asks with no stated priority ("more moves, a different look,
walls") turns into real research time on each before any of them can be scoped down to something
buildable, and a design idea (the stamina/flow/hype bridge) landing mid-task competes with whatever is
already in progress rather than opening its own turn. Read on for the review and the vocabulary that
follow from it.

*(That review and vocabulary were never written down — the tenth session's own hand-off stops here.
Rather than reconstruct someone else's unrecorded thinking, the twelfth session's own version follows
below, complete.)*

The twelfth session's shape (2026-09-17): **when the stated queue runs out, ask what "closed" actually
unlocked, and keep pulling that thread.** The tenth session's four-item queue was fully closed by the
session's own third commit; everything after that — wiring the four new systems into a live player,
finding they were computed but never scored in career mode, finding the same gap a third time in jump
and spin scoring — came from the same one-line question asked four separate times: "what's built but
disconnected?" That question found two real, silent bugs (music credit never reaching a landing;
`ReplayPlayer` never owning a grid) that no amount of staring at either feature in isolation would have
surfaced, because both were about the *seam* between two systems, not either system on its own.

**Key decisions made this session**, for whoever reads this next:

- **Designed curve over replay ghost**, for the carve/ghost-line question — the operator's own call,
  against the standing recommendation, on the strength of the Figure Eight's existing pattern.
- **Every new subsystem (`iceGridMode`, `staminaMode`, `hypeMode`, `flowMode`) follows the exact
  `movesMode`/`jumpMode`/`musicMode` convention**: 0 in every preset, an explicit argument or Params
  flag rather than a hidden global, and a replay-contract bump with the fixture re-recorded from its
  own inputs. Not asked for explicitly each time — inferred from the codebase's own established shape,
  and worth stating as a decision because it is what let four large features ship without touching a
  single existing test's assertions.
- **Flow models only the physics-observable half of bible §2.6's table**, and `sim/spinLevel.ts`
  scores only 2 of 10 ISU features — both scope cuts made unilaterally, then documented in the code's
  own header rather than raised as a question, on the judgement that the missing halves need new
  mechanics (pose data; direction reversal; combination spins) that are their own sessions, not a
  clarification that would have changed this session's own scope.
- **`SpinLevelTracker` rebuilds a segment history outside `sim/moves.ts`'s own `SpinState`** rather
  than extending that state's fields, to avoid touching a well-tested, load-bearing struct for a
  read-only analysis need — a deliberate choice to keep the blast radius of a scoring feature at zero
  for the physics it reads.

**Unresolved assumptions** — things treated as settled that were not actually confirmed with the
operator:

- Every new numeric constant's magnitude (drain rates, XP bonus sizes, the hype/flow/spin bonus
  scaling against the existing 150 XP/medal) is a guess calibrated only against this session's own
  tests, never against a played session. Reasonable-looking is not measured.
- `BEGINNER_PARAMS` inheriting the full fatigue/hype/flow stack via spreading `GAME_PARAMS` was never
  actually decided — it happened because that is how the existing code already composed presets, not
  because anyone asked whether a first-time player should feel balance noise on their first jump.
- The two scope cuts above (flow's partial model, spin level's partial model) were treated as obviously
  correct given the missing infrastructure, but were never put to the operator as a choice the way the
  carve question was — a session that disagreed about priority (build the pose layer first, say) would
  have had a real case.
- Hype's specific mechanism for "read the music engine's credit as an input" (a flat additive bonus on
  a clean landing that also hit a beat, rather than a multiplier, a streak extension, or something
  else) was one plausible reading of a one-sentence brief, chosen and built without checking whether it
  was the reading the operator had in mind.

**Three places this session could have been more efficient:**

1. Building the jump-TES career test, the first attempt used invented entry parameters (a plain
   forward glide) that produced an unidentified hop, not a scoreable jump — three iterations of
   debugging a `null` score before switching to `test/jump.test.ts`'s own known-good "clean triple toe
   loop" recipe verbatim. The lesson generalises: when a test needs a *specific* physics outcome this
   codebase already has a passing test for, copy that test's exact recipe first, and only invent new
   parameters once the borrowed one is confirmed working.
2. Both real bugs this session found (music credit, the ice grid's replay determinism) came from
   `step()`'s documented-but-easy-to-forget early-return path for an airborne skater. The first time
   cost real investigation to locate; by the second time the pattern should have been checked
   proactively for every new event-driven feature *before* writing it, not discovered by a failing
   test afterward. It was faster the second time only because the first one had already been paid for.
3. Scoping `sim/spinLevel.ts` took many small, sequential reads (the data file, `moves.ts`'s segment
   logic, checking whether `Sp.dir` is ever reassigned, checking `SPIN_POSITION`'s actual enum size) to
   arrive at "only 2 of 10 features are honest." Each read was necessary, but reading `sim/moves.ts`'s
   full spin implementation once, in one pass, at the very start of that investigation would have
   answered several of those questions at once instead of across separate round trips.

**Three places the operator's own prompting could have moved faster** (see the "working with this
operator" section above for the fourth-time-in-a-row pattern this generalises from):

1. Four separate "continue building" / "the next thing" / "keep cooking" messages each triggered a
   full clarifying-question round trip, because the explicit backlog had run out and several
   genuinely different-shaped candidates existed each time. A standing rough priority order stated once
   ("wire it in first, then whatever's cheapest, then ask again if you run out") would have let at
   least two or three of those rounds proceed straight to building.
2. Push and merge were requested as their own separate sentence four times, even though commit itself
   was authorized once and then treated as standing for the rest of the session. If the same standing
   authorization was intended to cover push+merge too, saying so once removes three repeated asks.
3. "lets dp the hype flow scoring and spin level next" bundled two substantially different-sized asks
   with no signal for how deep to go on either — the session had to invent its own scope ceiling for
   spin level (2 of 10 features) with no way to check whether that matched what was wanted until this
   very review. A stated depth ("just the easy wins" vs. "as complete as the physics allows") removes
   that guesswork in either direction.

**How to help me use these abilities better, concretely:** name a priority order when a message bundles
more than one ask; state a depth/scope ceiling when the ask is open-ended against a real spec (like
"score a spin" against a 10-feature document); and decide once, up front, whether routine actions
(commit, push, merge) should repeat automatically for the rest of a session or be asked for each time —
either is fine, but naming it once saves the asking.

**Vocabulary for the operator to study** (both used precisely, in a technical sense, more than once in
today's own work — knowing them back will make a future brief faster to write and faster for me to
read):

- **orthogonal** — two things that vary independently and do not interfere with each other. Today's
  four new systems (`iceGridMode`, `staminaMode`, `hypeMode`, `flowMode`) are deliberately orthogonal to
  each other and to every existing preset: each can be on or off without changing what the others do,
  which is what let four large features ship in one session without breaking a single existing test.
- **degenerate** (the mathematical/logical sense, not the colloquial one) — a case that collapses into
  another case instead of staying genuinely distinct. `spin.change_of_edge` is degenerate with
  `spin.both_directions` in this physics model specifically because a spin's blade tilt is defined as
  `-Sp.dir * SPIN_EDGE` — edge sign *is* rotation direction here, so "change the edge without changing
  direction" is not a state the model can ever actually be in.

The thirteenth session's shape (2026-09-17, same calendar date as the twelfth, a separate session):
**when asked to keep going with no stated target, close the oldest thread on the board first, then take
the next answer at face value and build the whole thing, not a token slice of it.** The session opened
on "keep cooking king your doing the best job" — encouragement, not direction — and the honest first
move was the queue's own oldest, most concrete item (the Slalom's missing curve), not a guess at what
would please most. Two later forks (which of three depths for a pasted Blender character script; PCS
vs. step sequences vs. stopping) were put to the operator directly rather than guessed, and both
answers were built in full rather than hedged down to something smaller and safer.

**Key decisions made this session**, for whoever reads this next:

- **The Black Berserker was rebuilt on `build_skater.py`'s own armature, not the operator's pasted
  script's.** The operator's draft used different bone names and rigid bone-parenting; `scripts/
  skater.gd` poses eleven bones by exact string match and silently no-ops on anything it does not
  recognise, so a mismatched rig would not error, it would just stand there — a decision made and acted
  on before asking, on the strength of reading `skater.gd`'s own posing code first.
- **PCS's physics-to-score mapping is labelled invented, in the file's own header, in those words**,
  rather than presented with the same confidence the formula itself deserves. The formula and the
  component factor are real (`data/segment-rules.csv`); the floor/ceiling pairs `rise()` uses for mean
  flow, lean depth, skid ratio and the rest are not, and there is no ISU document that could make them
  so — a decision to be honest about the seam between "transcribed" and "authored" inside one file,
  not to blur it for a cleaner-looking deliverable.
- **`stepLevel.ts`'s six-type ceiling is stated as exact, not approximate** ("six can never be seven,
  however combined"), and a dedicated test proves it by construction rather than by example. The
  alternative — leaving it as "usually caps around grade 1" — would have been true today and wrong the
  moment someone added a seventh type without reading the file's own math.
- **Every replay-contract bump this session included a direct kinematics check against the committed
  fixture**, not the "new flag defaults to 0, therefore safe" reasoning every earlier bump could use.
  Both `/14` and `/15` live under flags already on in real play (`movesMode`, `flowMode`), so the old
  reasoning does not apply, and treating it as if it did would have been the first unverified replay
  claim in this file's whole history.
- **A found production bug (the `step-features.json` 404) was chased to a regression test, not just a
  one-line fix.** The same shape of gap (a curated file list beside a dynamic `fetch()`) could recur for
  any future asset; `test/app-loads.test.ts` now checks the actual relationship between the two files
  rather than trusting that this one instance was the only one that mattered.

**Unresolved assumptions** — things treated as settled that were not actually confirmed with the
operator:

- Every new numeric constant this session (`spinReverseStick/-Rate/-Floor/-Regen`, `flowDeadAirTime/
  -Loss`, and all of PCS's `rise()` floors and ceilings) is guessed and tested for direction only, the
  same open item every prior session has carried and this one did not close either.
- PCS's specific choice of observables per component (flow + lean depth + skid ratio + edge-changes-
  per-minute for Skating Skills; music-credit rate alone for Presentation; ice coverage alone for
  Composition) is one reasonable reading of the bible's own "driven by" column, chosen without checking
  whether the operator would have weighted those four unevenly, or wanted a different one entirely.
- Crossover and change-of-edge counting as legitimate "distinct types" toward the step-sequence variety
  ladder is a defensible extension of `data/step-features.json`'s own taxonomy (which does not list a
  crossover at all), never put to the operator as the judgement call it actually is.
- The Black Berserker's proportions and silhouette were approved by one rendered screenshot and one
  headless smoke test, never seen animated, in the Godot editor, by the operator.
- Whether "step" belongs in any of the five fixed `CAREER_EVENTS` was treated as clearly the operator's
  own call and left alone — reasonable, but it does mean the feature this session built is not actually
  reachable yet outside the Composer, and that gap was never flagged as urgent, only noted.

**Three places this session could have been more efficient:**

1. `spinReverseFloor`'s first value was chosen by estimating typical angular-momentum ranges by hand,
   without first checking how it would interact with `spinMinOmega`'s own pre-existing exit condition —
   a full probe-script run came back showing the spin just ending instead of reversing, and only THEN
   was the actual interaction traced and understood. Tracing the old code's behaviour at the new
   state's boundary, before picking a number, would have skipped the failed run entirely — §5 item 31
   now says so for next time.
2. A live-browser Playwright check for the spin reversal assumed the entry direction from the first
   attempted key (`a`), got the sign backwards against the measured direction, and had to be corrected
   and re-run once the HUD's own direction arrow was actually read from the first screenshot. Reading
   the state back before scripting the "opposing" input, rather than assuming a fixed convention, would
   have been one run instead of two.
3. `ScheduleWakeup` was called once to "wait" for a backgrounded Bash task outside `/loop` mode — a
   tool built for a different purpose, misapplied to a purpose the harness already handles on its own
   (a task notification arrives without prompting one). It produced a stray `n/a` turn that then had to
   be explicitly identified as not real user input before the session could continue confidently. Noted
   in `SendFeedback` in-session and now in §0 above so it does not repeat.

**Three places the operator's own prompting could have moved faster** (a continuation of the same
pattern the twelfth session's own review already named once — see how many of today's own examples are
the identical shape):

1. **"Keep cooking king your doing the best job" and a plain "n/a" were, between them, the entire
   steering for two separate forks today** — which large item to pick up, and (implicitly) whether to
   push. Both resolved fine because the session asked rather than guessed, but that is two more
   clarifying round trips added to the four the twelfth session's own review already flagged for the
   identical instruction pattern. This is now a recurring habit worth naming plainly: a one-line
   standing priority ("always finish the oldest queue item before a new one" or similar) would remove
   most of these asks permanently, not just today's.
2. **"any way we can use this on our character?" named neither which character (the browser's 2D
   figure or the Godot 3D model — genuinely different systems, one of which cannot use a 3D asset at
   all) nor what "use" should mean** (replace, preview, or add as an option — three real, differently-
   sized answers). A full investigation-then-ask round trip resolved it; naming the target system in
   the same sentence as the ask would have skipped straight to the question that mattered.
3. **"lets program the [components] score and then build the step sequence mechanic... sync with the
   music engine" bundled two large, differently-shaped tasks in one sentence with no relative depth
   signal** — the same exact pattern (bundled asks, no stated ceiling) the twelfth session's review
   already flagged for "hype flow scoring and spin level." Naming it again here because it recurred
   across sessions unchanged: this operator's own default phrasing style bundles adjacent asks, and the
   fix (a one-word depth cue per item) is cheap and has now been asked for twice.

**How to help me use these abilities better, concretely:** the twelfth session's own advice still
stands and today's session did not follow it any more than that one did — name a priority order once
when a message bundles more than one ask, name the target system when an ask could apply to more than
one (browser vs. Godot, in this repo, is the recurring fork), and state a depth ceiling when the ask is
open-ended against a real spec. One new one from today specifically: when pasting an external script or
asset and asking "can we use this," say what it is *for* (which character, which system, which file it
should become) in the same message — it turns an investigation into a plan.

**Vocabulary for the operator to study** (both map directly onto language this session's own code
comments now use, so recognising them back will make a future brief faster to write and faster for me
to read):

- **ceiling** (as this session's own code and docs use it, not just informally) — the honest maximum a
  system can reach given what actually exists, stated as a hard fact rather than a hedge.
  `sim/stepLevel.ts` does not say "usually around grade 1"; it says grade 1, exactly, because six
  observable types cannot become seven. Asking "what's the ceiling on X" is a sharper question than
  "how far can you take X" — it asks for the provable limit, not a guess at effort.
- **timebox** (verb) — to cap how much depth or investigation a task gets, decided in advance rather
  than discovered by running out of turns. "Timebox the lobe-tracker design to a quick recommendation,
  don't build it yet" is a complete instruction; "look into the lobe thing" is not. Using this word in a
  prompt is the single cheapest fix for the recurring "bundled asks, no depth signal" pattern named
  above, in both this session's own review and the twelfth's.
