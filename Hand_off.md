# Hand-off

**Last session: Sunday 2026-09-13 (tenth, the third session that day). Repo state: complete
specification, a running Ice Lab (moves, jumps, profiles, replay), and — new today — the fidelity
track: a written fidelity gate, an open-constants register, a rink-ice literature digest, a validation
case corpus, a headless validator run in CI on every push, and a generated fidelity report. Also new in
the engine: rink surface shape and the wind-up jump assist.**

Read this before touching anything. It covers what exists, what is decided, the conventions that
hold the document set together, and the things most likely to trip you up.

## 0 · Start here (written 2026-09-13, tenth session)

**Two checkouts. Check which one you are in first.**

| Path | Branch | What is there |
| --- | --- | --- |
| `/home/kill/KoLd__FEEt.fidelity` | `fidelity-00-repo-correction`, **pushed**, 14 commits ahead of `origin/main`, CI green (run 34799870011, Node 24 and 26) | All of today's work. **This file.** No PR opened yet. |
| `/home/kill/KoLd__FEEt.ice_skating_` | `ue-replay-01-foundation` | Another session's branch. Its `Hand_off.md` has **uncommitted edits from that session**: do not overwrite them. It also holds the operator's play data (`E_W_replays_sessions_eng_bld/`, untracked) and a saved-page HTML, both not to be committed. |

Run `git worktree list` and `git status --short --branch` before editing anything. **Local `main` in
the main checkout is behind `origin/main`**, so branch from `origin/main`, never from local `main`.
This file is uncommitted in the worktree. Commit it with the next piece of work, or on its own if the
operator asks.

**What the session was.** The operator handed over **"Edgework — Fidelity Track Brief"**. The project is
built by one person with no funding. The near-term gate is **fidelity**, not fun: does the blade–ice model
reproduce measurable skating within stated tolerances? UE5 is deferred indefinitely, and the $11.9M phase
plans are kept as a funded long-horizon scenario. The brief's non-goals are:
- no UE5 work;
- no making `src/reference/` compile;
- no progression, scoring loops or game wrapper;
- no Steam or Tauri;
- no revising the phase plans.

Its working agreement is small commits, one task per commit, and stopping to ask on licensing, scope or
public framing.

**Brief tasks, with status:**

| Task | Commit | State |
| --- | --- | --- |
| 0.1 Licence `tools/` | `bd68a80` | **Apache-2.0**, operator's choice (option A); recorded as **D7** because D6 was taken. `tools/ice-lab/LICENSE`. |
| 0.2 README status | `93ac92c` | Rewritten against the repo. It had said 97 tests, never mentioned the live Pages build or `native/`, and still framed the "is carving fun" gate as near-term. |
| 0.3 `docs/fidelity-gate.md` | `472ec39` | The specification: evidence levels L0–L3, source types, configuration under test, observables O1–O7, bands, verdicts, pass condition, what a failure obligates. |
| 1.1 `docs/open-constants.md` | `9a6f191` | Every chosen number in `sim/`, each with value, where used, level, range and what would measure it. |
| 1.2 `data/validation/` | `c926f39` | Case format with the **rink record**. 32 cases: 6 derived, 2 literature stubs, 21 footage/protocol stubs, 3 unmodelled turns. |
| 1.3 `tools/ice-lab/validate.mjs` | `c8312e4` | Headless, zero dependencies, `--json`, `--cases`, `--clips`, `--report`. |
| 1.4 CI | `316de0b` | `ice-lab-checks.yml` on every push to any branch: tests, build, fixture, validator, report freshness. |
| 1.5 `docs/fidelity-report.md` | `5e6308e` | Generated and deterministic. CI fails if the committed report is stale. |
| 2.1 Pages | — | **Already existed** before the brief (`pages.yml`, deploys `main`). |
| 2.2, 2.3 | — | Not started. The brief gates Phase 2 on "a non-trivial number of passing sourced cases". Today there are **zero** external ones. |

**Beyond the brief, on the operator's direction:**

- **`docs/ice-literature.md`** (`2e50485`, `6ca236f`) covers Lever et al. 2022 (J. Glaciology,
  doi:10.1017/jog.2021.97) and Hutchins, Wang & Impellizzeri 2026 (Sports Eng., doi:10.1007/s12283-025-00538-z).
  Both were read in full. Every number is marked measured, modelled or secondary.
  - **Kinetic skate friction:** 0.0046–0.0071, via de Koning 1992 and Federolf 2008. `muGlide` 0.006 sits
    inside that range, and the range is now recorded.
  - **Hutchins's friction figure is a static index** (about 3× kinetic), so only its relative trends transfer.
  - **The sign of the temperature–friction relation is contested** between the sources. Do not add it yet.
  - **IIHF air temperature (9–11 °C) implies about 1.25 kg/m³.** The model's `airDensity` of 1.29 is 0 °C
    air. Recorded, **not changed**.
  - **Lever's pressure-melting point at −5 °C reads 60 MPa on p. 342 and 90 MPa in the conclusions.**
    Neither is used.
- **Rink surface shape** (`1778d8f`, replay `/7`). `rinkRelief` is centre ice minus the boards: a crown on
  a public rink, a bowl in an old thin-slab barn. **O** cycles flat, public (+4.5 mm) and barn (−9 mm).
  All of it is L3, sized to be "barely perceivable". It is applied along the travel only, and every preset
  is flat.
- **Gate §4.4 settle time** (`72df915`, operator's decision). The first validator run failed
  `carve-residual-fast-deep` at −0.63°. Measurement was checked first: the validator's lateral
  acceleration matched `latAccel` to 0.03%. The cause was the arms' authority still washing out
  (τ 1.5 s) inside a window that began at 2 s. The steady window now settles for **5 s where
  `internalWashout` > 0** (`responsive`, `assisted`) and 2 s where it is 0 (`spec`). The operator: *"i like
  that we get emerging mechanics from the physics interactions thats intended"*.
- **The wind-up jump assist** (`c98fea7`, replay `/8`).
  - **Input:** `SkatingInput.windup`. **U**, or the right stick thrown right in schemes A and B.
  - **Arming:** a flick against the rotation within 0.6 s of the release. A flick the other way cancels it.
  - **Effect:** scaled by `jumpAssist` (spec 0.25, responsive 0.5, assisted 0.8). The whip gets a floor, and
    in the air `assistedCarriage` bisects over `rotationToLand`, a tick-for-tick rollout of the rest of the
    flight, to land the nearest reachable revolution.
  - **Bound:** it moves only I. Angular momentum is conserved and air time is untouched.
  - **Measured:** responsive 3T 3.041 → 3.000 rev; assisted half-whip 2T< and a fall → clean 2T.
- **Watching scripted play:** `node tools/ice-lab/demo.mjs` writes `build/demos/`. Each demo is a replay
  clip plus a `.txt` input timeline: a carve figure, and the toe loop manual, wound, wound the wrong way,
  and flick-only on assisted. The operator asked to study bot inputs; this is the answer. Open a clip with
  **import replay**.

**Validator today:** 6 pass, 0 fail, 23 unsourced, 3 unmodelled. **The gate is not met.** No observable
class has external evidence.

**Open, in the operator's hands:**

1. **Measurements.** Fill stubs from footage or papers. The two literature stubs need their **primaries**
   read (Federolf 2008; de Koning 1992) before they count.
2. **Whether to open a PR / merge** `fidelity-00-repo-correction`. Merging moves the public Pages build to
   replay `/8`; older clips then verify only against older commits.
3. **`airDensity` 1.29 → about 1.25.** Physically sourced, but it changes solver arithmetic, so it needs its
   own commit and replay bump.
4. **The spec baseline.** `spec`'s `jumpAssist` is 0.25 on the operator's word, which departs from "spec =
   the package". Only relevant with jumps on and a wind-up.
5. **Earlier asks still open** (see 0.1 below): the carve as a feature (ghost line: a replay's tracing or a
   designed curve?), the career module, stat balance tied to scoring, stamina pools.

**Toolchain reminders.**
- **Typecheck:** there is no tsc on the box. Scratch-install `typescript @types/node` and run
  `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from `tools/ice-lab/`. It was clean at
  every commit today.
- **Replay bumps:** snapshot the old `sim/` with `git archive HEAD tools/ice-lab/sim | tar -x -C <scratch>`.
  Compare old and new on the fixture plus the operator's clips in
  `/home/kill/KoLd__FEEt.ice_skating_/E_W_replays_sessions_eng_bld/` (`d0dfddc5` is `/6` with two jumps;
  `4b7568b7`, `6f5c711f` and `a5a66c98` are `/4`), every state field and event every tick. Then re-record
  the fixture from its own inputs, keeping **exactly** the current `DEFAULT_PARAMS` keys.
- **Report:** after changing any case or anything the validator reads, regenerate with
  `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md` or CI fails.
- **Tests:** 272.

---

## 0.1 · The ninth session (earlier the same day)

**Repo:** `main`, pushed. The moves branch was fast-forwarded into `main` on the operator's word, and
the two-footed stance fix (finding 9) followed on `main`. The operator's play data lives in **`E_W_replays_sessions_eng_bld/`** at the
repo root (cards, clips, params exports, event logs), untracked on purpose; use only what is there,
and do not commit or delete it without asking. The stray `Ice Lab — KoLd__FEEt edgework.html` at the
root is a browser "save page" of the lab, also untracked — not a source file.

**How the session turned.** It opened on the eighth session's list, and the carve item (below) was
assessed and put to the operator as one question. They redirected instead, in their words: *"i noticed
that alot of ice skating is done mostly while skating with the skaters body and blades facing
backwards, so we need to add to the sim engine that carving in reverse right before a jump is how most
figure skaters are able to perform ... it looks like skating in reverse adds alot more speed and
angular momentum as well."* That was measured and answered before anything was built: jumps do take
off backward (five of six); a back edge adds spin only through the way it curves — the same inputs
turn 3.04 revolutions backward and 2.58 forward, and the lutz's back edge curves against its spin;
backward is **not** faster (the rig's stroke is mirrored exactly, and `data/motion-primitives.json` has
back pushes slightly weaker); the real gap was that nothing in the engine could turn a skater around.
Then: *"yes build the three-turn, swizzles, Crossovers, edge and toe jumps, spins, the Ina Bauer and
the mohawk. and your right, i am seeing skaters doing back crossovers right into the jump and we need
to put that in the games engine for simulation realism"*.

**What was built** — one layer per commit, every one behind **`movesMode`**: 0 in every preset, forced
to 0 under `?playtest=1`, and every lever inert at 0, the way jumps are contained. Each number is a
test in `tools/ice-lab/test/`, measured before it was asserted, against the project's own data:

| commit | layer | measured | data |
| --- | --- | --- | --- |
| `8da3a2a` | **crossovers** — a push while leaning into a curve; the inside foot pushes under on its outside edge; both pushes carry the arc | +1.01 m/s forward, +0.92 back, per crossover at full knee | +1.15 / +1.05 |
| `aee316c` | **three-turn and mohawk** — a pivot on the rocker, a frame flip at the cusp, the weight at the cusp decides which; a jump out of one inherits its rotation | 0.46 / 0.42 m/s from 6.2; a half-whip salchow 1.60 rev and a fall from a steady LBI, 1.88 and a clean double out of a three-turn | 0.45 / 0.40 |
| `a282cf7` | **twizzles** — the pivot kept going; hold to sustain, stick to steer, let go to come out forward or back | two revolutions in 0.84 s for 0.96 m/s | 720° for 1.0 m/s |
| `e10e6a7` | **spins** — L from the entry (m v spinArm, the check), I from the position, ω = L / I; knee deep sit, stick forward camel | upright off 4.5 m/s: 4.0 rev/s draining to 2.3 over 4 s, 11 revolutions, 0.29 m drift | inertia scales from `spin-positions.json` |
| `33986ce` | **the Ina Bauer** — two feet, the trailing blade reversed; lean toward the lead foot and both are outside edges | 1.03 m/s in a second from 5.85 | 1.1 over 6 m at 6 |
| `1e38ad0` | **edge and toe jumps from their entries** — the approach is 20% of the lift, per jump at its triple's entry speed; a toe jump vaults over its pick | a loop off at 4.6 m/s turns 2.61 and falls; after back crossovers, off at 7.4, 2.83 and lands | entry speeds from `entry-templates.json` |

**With the moves off, nothing moved.** Every commit replayed the fixture and three operator clips —
22,184 ticks, the hop clip included — through the committed `/4` solver and the new one, with every
`/4` state field and event identical on every tick (scratch script, recipe in §5 item 14). The replay
contract was **`ice-lab-f64/5`** for the whole set, and is **`/6`** since the stance fix. Any further
change is `/7`.

**Controls with the moves on** (**L** toggles them; **J** / D-pad ↑ steps off → hop → full jumps →
full jumps with the moves). Keyboard: **B** turn, **Z** twizzle, **Y** spin, **I** Ina Bauer, with Q / E
choosing the foot. **The pad's face buttons switch to the bible's §2.1 layout** — B turn, X twizzle, Y
spin, LB + RB Ina Bauer, the toe pick a tap of LT (held, still the brake), **reset on Back**, preset and
scheme on keyboard T and M only. **Tell the operator before they play: they reset with Y.** A held stick
keeps its circle through a turn (`latchTurns`, `app/schemes.ts`).

**Found along the way** (each in the README):

1. **The bible's §2.2 has the crossover feet backwards** (*"the outside foot pushes under"*). The
   underpush is the inside foot's, on its outside edge. Corrected in `sim/solver.ts` and recorded —
   a candidate for the §3.5 corrections table and the bible itself, which was not edited.
2. **A stroke on a curve always halved the body's lateral support** — the pushing leg carries weight
   and no centripetal force — so a curve collapsed the moment anyone pushed on it: 51% short of the
   arc, lean swinging 19–53°. Nothing stroked on a curve before. Kept in `spec` and with the moves off;
   with them on, every push has the carving blade carry the pushing leg.
3. **Two feet down, the stance pulled against the lean** — finding 9, fixed on the operator's word the
   same day. The centre-of-pressure term was proportional-only and aimed at the lean the edge
   balances, so a two-footed 20° command at 4 m/s pinned the blade and fell at 3.4 s. It now has a
   rate term (`copRateGain`) and aims at the commanded lean as far as the edge can carry its load
   (`copCommandShare`), both 0 in `spec`: every two-footed lean the edge can hold is held within 0.5°,
   standing still is bit-for-bit unchanged, one foot is untouched. Replay `/6`.

**The operator's asks from 2026-09-11 are still open**, in their order: (1) **the carve as a
feature** — *"a ghost line to follow"*, *"use the carved lines as a performance tool"*; this session
recommended one layer, `sim/ice.ts`: a ~12 cm damage/snow grid written by every blade pass (bible
§3.2), read by glide friction and bite (0.006 → 0.015, off in `spec`), with the ghost carving its own
ice so its whole line lies ahead of you and an "off the line" read against it. The one question —
is the ground-truth line a replay's tracing or a designed curve — went unanswered when the operator
redirected; the recommendation was a replay's tracing, the Figure Eight keeping its circles for §6.
Also: `SkateSolver.cpp` reads friction where it just wrote the tracing, so a blade would slow on its
own wake — cells need the tick they were cut. (2) **A career module** calling `train`. (3) **Stat
balance tied to scoring**, not before (1) and (2). (4) **Stamina pools** in the solver.

**Loose ends of the moves**, none started: scheme B cannot steer backward (it chases the heading,
which a turn reverses); spin levels (`SpinResolver.cpp` — the state already records positions held two
revolutions); turns and twizzles in step-sequence levels (`step-features.json`); brackets, rockers,
counters, choctaws; the jump challenge still starts attempts at 5 m/s (with the moves on its panel
shows the target's entry speed beside yours).

**Toolchain reminders:** `npm run typecheck` still fails (no tsc on the box); scratch-install
`typescript @types/node` and run `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from
`tools/ice-lab/` — TypeScript 7.0.2 was clean at every commit. **Headless Chromium** (`/usr/bin/chromium`)
drives the real page over the DevTools protocol with nothing installed: `node app/serve.mjs`, launch
`--headless=new --remote-debugging-port=…`, connect with Node's global `WebSocket`, and inject a fake
analog pad with `Page.addScriptToEvaluateOnNewDocument` overriding `navigator.getGamepads` — the
keyboard's A / D is a full 65° lean and puts the skater down at once. The README's test count is 249.

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
| Documents | 12 in `docs/`: the 8 plan and spec documents, plus `fidelity-gate.md`, `open-constants.md`, `ice-literature.md` and the generated `fidelity-report.md` |
| Data files | 12 in `data/` — 5 CSV, 6 JSON, 1 README — plus `data/validation/` (README and 32 cases) |
| Reference code | 6 files in `src/reference/` — specifications-as-code, do not compile |
| Engineering material | `big_reffg.txt` — 3,711 lines, three concatenated documents, **has known defects, see §2.2** |
| Implementation | `tools/ice-lab/` — 272 tests, zero dependencies, replay `ice-lab-f64/8`, camera, three courses with ghosts, jumps (off by default) with the wind-up assist, scoring from `data/`, skater profiles, the moves (off by default), rink shape (flat by default), `validate.mjs`, `demo.mjs`. Licensed Apache-2.0 (D7) |
| Rendered pages | 5, published as Artifacts **and** mirrored in `docs/web/` |
| Decisions | **5 of 7 closed** (D7, the `tools/` licence, closed 2026-09-13). D1 and D5 remain, and belong to the funded studio scenario, not the fidelity track |

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
node --test test/*.test.ts     # 249 pass, ~7 s
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

29. **The fidelity gate forbids moving its own goalposts silently.** A tolerance or window may change
   after a result is seen only in a commit that changes nothing else and cites a reason
   (`fidelity-gate.md` §5). §4.4's settle time was changed that way, on the operator's decision. Do not
   widen a band, edit a case, or retune a constant to turn a validator failure green. Follow §7: first
   the measurement, then permitted L2/L3 moves, and structural failures are never tuned away.

30. **A derived case checks the implementation, not reality.** The 6 passing cases are all derived, so
   the gate stays unmet until footage, protocol or **primary-checked** literature cases pass. Never
   invent an `expected` value. A null stub is correct.

31. **The validator reads `BOOT_PRESET` from `sim/params.ts`** (moved there from `app/lab.ts` today). Its
   `BANDS` table must match `fidelity-gate.md` §5.1. A case whose band or √(u_m² + b²) tolerance disagrees
   fails as invalid.

32. **A flat lean is not a balanced body.** On `responsive` and `assisted` the arms' authority holds a
   lean for several seconds after it looks settled (`internalWashout` 1.5 s). Any new steady-state
   measurement has to wait it out, which is why §4.4 settles for 5 s there.

33. **Replay `/8` input has `windup`**, and `parseReplay` requires every input key. Any hand-built
   `SkatingInput` must spread `NEUTRAL_INPUT`. A flick arms only within `windupWindow` of the release and
   only with `jumpMode` 2. Cases never wind up, so the assist cannot move a gate observable.

34. **Rink shape needs a start position, and replays have none.** `rinkRelief` is 0 at centre ice, and
   clips always start at the origin, so a shaped-rink glide case cannot yet place the skater away from
   centre. A replay `initial.pos` would be a contract change (`/9`).

35. **`python3` edit batches that assert before writing leave nothing half-applied**, but a batch that
   fails part-way skips every later file. Re-grep version strings (`git grep "f64/"`) after every replay
   bump: the Ice Lab README's contract paragraph sat at `/6` through `/7` until it was caught.

---

## 6 · Where to go next

In descending order of value, **for the fidelity track** (the operator's current plan, 2026-09-13):

1. **Get external evidence into the corpus.** Fill the stubs in `data/validation/cases/`, one observable
   at a time, starting where effort does not enter the measurement: `spin_decay_per_s`, `pull_in_ratio`
   and `air_time_s` from broadcast frame counts; `glide_decel_ms2` from paired opposite-direction runs.
   Read Federolf 2008 and de Koning 1992 in the primary before their stubs get values. Regenerate the
   report after each.
2. **Decide the PR / merge** of `fidelity-00-repo-correction` with the operator. It moves the public
   build to replay `/8`.
3. **Phase 2 (2.2 landing copy for skaters, 2.3 `wrong-edge.yml` intake)** once the report shows
   non-trivial sourced passes. Phase 3 stays gated.
4. **The `airDensity` correction** (about 1.25), as its own replay-bumping commit.

For the funded studio scenario, retained as a long-horizon target:

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
   and an edge code whose spelling already matches `data/jump-definitions.csv`.
5. **Verify the ISU data.** `spin-features.json`, `step-features.json` and `scale-of-values.csv`
   are faithful models, not transcriptions, and all carry `verified_against_isu: false`.
6. **Build the protocol validation corpus** — 50 published elements reconstructed against the level
   detector, target ≥85% agreement. Needs Composer v0, so it belongs to the vertical slice.

### Not in the rig, deliberately

Brackets, rockers, counters and choctaws; spin and step-sequence levels; jump combinations and
sequences; stamina pools, flow, animation, networking, a career state, and ice-grid feedback — tracings
are drawn but do not yet feed friction or bite back into the solver as the bible's §05 requires. The
stroke is the bible's semi-analytic push, not a leg model. The profile layer (2026-09-11) exists but
nothing moves its stats yet. The moves (2026-09-13) exist, contained; see §0.

### Known gaps, all deliberate

Tracked at the foot of [open-decisions.md](docs/open-decisions.md): balance-model tuning constants
(**the Ice Lab is now the instrument for these** — they were "cannot be derived, they come from the
feel prototype"), crowd reaction propagation timing, career economy, and ice temperature as a
career variable.

---

## 7 · The one thing that matters most

**Near term (since 2026-09-13): whether the model is *right*.** The fidelity gate in
[docs/fidelity-gate.md](docs/fidelity-gate.md) asks whether the blade–ice model reproduces measurable
skating within tolerances stated in advance. It can be answered by one person, offline, for nothing.
Today it is not met: every passing case is derived, and every external case is a stub.

If a future session is asked to make it pass by editing a case, widening a band after seeing a result,
or retuning a constant without the §7 procedure, **push back**. The gate is only evidence if its
goalposts move in the open, with a reason, in a commit of their own. A validator failure is information:
diagnose the measurement first, as §7.1 says, then put the choice to the operator.

**Long term, for the funded scenario:** everything is still downstream of one unproven claim, **that analog
lean plus analog knee pressure is a good primary verb.** No shipped game has used it. The studio plan's
week-16 kill gate — *"is carving fun with no jumps, no score and no art?"* — keeps its pre-committed
thresholds, a decision-maker who is **not** the scheme's inventor, and the authority to stop the project.
The same push-back applies to softening it.

---

## 8 · Session log

| date | what happened |
| --- | --- |
| 2026-09-13 (tenth, worktree `/home/kill/KoLd__FEEt.fidelity`) | The **Fidelity Track Brief**, Tasks 0.1–1.5: `tools/` Apache-2.0 as D7; README reframed to the fidelity gate; `docs/fidelity-gate.md`; `docs/open-constants.md`; `data/validation/` with rink records (32 cases); `validate.mjs`; CI on every push; generated `docs/fidelity-report.md`. Also `docs/ice-literature.md` (Lever 2022, Hutchins 2026, read in full); rink surface shape (replay `/7`); gate §4.4 settle 5 s on washout presets after the first validator run caught the arms' transient; the wind-up jump assist with a flight-rollout controller (replay `/8`); `demo.mjs` clips to watch. Both replay bumps proven identical on the fixture and four operator clips, 49,539 ticks. 272 tests, tsc 7.0.2 clean, pushed, CI green on Node 24 and 26. Validator: 6 pass, 0 fail, 23 unsourced, 3 unmodelled; gate not met. |
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

The tenth session's shape: **specify, then implement, then let the first run argue back.** A brief with
numbered tasks and an explicit stop point ran cleanly as one task per commit. The licence was put as a
tradeoff and not picked, and stale facts in the brief (D6 taken, 97 tests, Pages already live) were
flagged in one line each. The most useful moment was a failure: the validator's first run failed a case
that the spec's own window definition had been written to pass. Tracing it — measurement verified first,
then the arms' washout — turned a red build into a decision the operator made. What cost time: §4.4's
"chosen so the controller has settled" was written without measuring it. The first wind-up assist was
built through five files before a probe showed it made clean jumps worse, which meant a rewrite and a
second fixture re-record that briefly kept a deleted parameter key. The rule is the ninth session's
again: **measure, then write.**

